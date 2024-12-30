const TelegramBot = require('node-telegram-bot-api')
const LocalDatabase = require('./db')

require('dotenv').config()


const token = process.env.API_TOKEN
const url = process.env.URL

if (!token || !url) {
    throw Error('Token or URL not specified')
}
console.log("Env configured, opening webhook...")

const bot = new TelegramBot(token, {
    webHook: {
        port: process.env.PORT,
        autoOpen: false,
    }
})

bot.openWebHook();
bot.setWebHook(`${url}/bot${token}`)

const autoloadCallback = (db, error) => {
    const interval = setInterval(() => {
        let requests = db.getNewRequests()
        console.log("New requests: " + requests?.toString?.())
        if (!requests?.length) {
            console.log("No new requests")
            return
        }
        
        let operators = db.getOpenOperators()
        console.log("Open operators: " + operators?.toString?.())
        if (!operators?.length) {
            operators = db.getSortedOperators()
            console.log("Sorted operators: " + operators?.toString?.())
            if (!operators?.length) {
                console.log("No registered operators")
                return
            }
        }

        for (let i = 0; i < requests.length && i < operators.length; i++) {
            const request = requests[i]
            const operator = operators[i]
            const contact = db.getContact(request.chat_id)
            if (!contact) {
                console.error(`Contact for request ${request.id} : ${ request.chat_id } not found`)
                return
            }
            console.log(`Send request '${request.id}' to operator '${operator.username}'`)
            db.updateRequest(request.id, {...request, status: 'IN WORK', operator: operator.id})
            db.updateOperatorCount(operator.id, (operator.count ?? 0) + 1)
            const message = `Новый запрос: ${request.description}\nКонтактные данные:\n${contact.last_name} ${contact.first_name}\n${ contact.phone_number }\n${contact.email}\n${contact.username}`
            const entities = [
                {
                    type: 'phone_number', offset: message.indexOf(contact.phone_number), length: contact.phone_number,
                }, {
                    type: 'email', offset: message.indexOf(contact.email), length: contact.email,
                }
            ]
            if (contact.username?.length) {
                entities.push({
                    type: 'mention', offset: message.indexOf(contact.username), length: contact.username,
                })
            }
            bot.sendMessage(operator.chat_id, message, { entities: entities, reply_markup: {
                inline_keyboard: [[
                    {
                        text: 'Закрыть заявку', callback_data: 'closeREQUEST' + request.id,
                    }
                ]]
            }}).catch(reason => {
                console.error(`Send message error`, reason)
                db.rollbackRequest(request.id)
                db.updateOperatorCount(operator.id, (operator.count ?? 1) - 1)
            })
        }
    }, 20000)
}

const db = new LocalDatabase()

bot.on('callback_query', query => {
    console.log(`Callback query: ${ query.toString() }`)
    if (!query.data) {
        return
    }
    const [command, request_id] = query.data.split('REQUEST')
    switch (command) {
        case 'close':
            try {
                db.updateRequest(request_id, {
                    status: 'CLOSED',
                })
            } catch (e) {
                console.error(e)
                bot.answerCallbackQuery(query.id, {text: 'Ошибка при закрытии запроса!'})
                return
            }
            bot.answerCallbackQuery(query.id, {text: 'Запрос успешно закрыт!'})
            return
    }
})

const validateEmail = (email) => {
    if (!email) {
        return false
    }
    return String(email)
      .toLowerCase()
      .match(
        /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|.(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
      );
  };

const reply = (msg, state) => {
    switch (state) {
        case 0:
            return bot.sendMessage(msg.chat.id, 
                `Здравствуйте! Для того, чтобы оставить заявку, нужно предоставить номер телефона и почту.`,
                {reply_markup: {
                    keyboard: [[{request_contact: true, text: 'Передать номер'}]],
                    is_persistent: true,
                    one_time_keyboard: true,
                }}
            ).then(() => 1, () => state)
        case 1:
            if (msg.contact) {
                db.updateContact(
                    msg.chat.id,
                    msg.contact,
                )
                return bot.sendMessage(msg.chat.id, 
                    'Теперь введите свою почту.',
                    {reply_markup: {
                        force_reply: true,
                        input_field_placeholder: "example@mail.ru",
                    }}
                ).then(() => 2, () => state)
            } else {
                return bot.sendMessage(msg.chat.id, 
                    `Для того, чтобы оставить заявку, нужно предоставить номер телефона и почту.`,
                    {reply_markup: {keyboard: [[{request_contact: true, text: 'Передать номер'}]]}}
                ).then(() => 1, () => 1)
            }
        case 2:
            const hasEmail = !!db.getContact(msg.chat.id)?.email;
            if (validateEmail(msg.text) || hasEmail) {
                if (!hasEmail) {
                    db.updateContact(msg.chat.id, {email: msg.text})
                }
                return bot.sendMessage(msg.chat.id, 
                    `Пожалуйста, оставьте описание вашей заявки.`,
                    {reply_markup: {
                        force_reply: true,
                        input_field_placeholder: 'Хочу купить автомобиль!'
                    }}
                ).then(() => 3, () => state)
            } else {
                return bot.sendMessage(msg.chat.id, 
                    'Пожалуйста, введите корректную почту.',
                    {reply_markup: {
                        force_reply: true,
                        input_field_placeholder: "example@mail.ru",
                    }}
                ).then(() => 2, () => state)
            }
        case 3:
            db.updateRequest(undefined, {chat_id: msg.chat.id, description: msg.text, status: 'NEW'})

            return bot.sendMessage(msg.chat.id, 
                'Спасибо! С вами свяжется наш оператор!',
                {reply_markup: {
                    remove_keyboard: true,
                }}
            ).then(() => 4, () => state)
        case 4:
            const requests = db.getRequestsByChatId(msg.chat.id)
            const countOfOpenRequests = requests.filter(r => r.status !== 'DONE').length
            if (countOfOpenRequests > 0) {
                if (countOfOpenRequests >= 3) {
                    return bot.sendMessage(msg.chat.id, 
                        'Вы достигли лимита открытых заявок! Пожалуйста, дождитесь их обработки.',
                    ).then(() => 4, () => state) 
                }
                return bot.sendMessage(msg.chat.id, 
                    'У вас уже есть заявка, хотите завести новую?',
                    {reply_markup: {
                        keyboard: [[{text: 'Да'}]]
                    }}
                ).then(() => 5, () => state)
            }
            
            return bot.sendMessage(msg.chat.id, 
                'Ваша заявка обработана, хотите завести новую?',
                {reply_markup: {
                    keyboard: [[{text: 'Да'}]]
                }}
            ).then(() => 5, () => state)

        case 5:
            if (msg.text?.toLowerCase() === 'да') {
                return reply(msg, 2)
            }
            return reply(msg, 4)
        default:
            return Promise.resolve(state)

    }
}

const getAdminKeyboard = (isSuper) => {
    const keyboard = [
        [
            {text: 'Список операторов', request_user: {request_id: 1, user_is_bot: false, request_name: true, request_username: true}},
            {text: 'Список админов', request_user: {request_id: 2, user_is_bot: false, request_name: true, request_username: true}}
        ],
        [
            {text: 'Добавить оператора', request_user: {request_id: 1, user_is_bot: false, request_name: true, request_username: true}},
            {text: 'Убрать оператора', request_user: {request_id: 2, user_is_bot: false, request_name: true, request_username: true}}
        ]
    ]
    if (isSuper) {
        keyboard.push([
            {text: 'Добавить админа', request_user: {request_id: 3, user_is_bot: false, request_name: true, request_username: true}},
            {text: 'Добавить супер админа', request_user: {request_id: 4, user_is_bot: false, request_name: true, request_username: true}},
            {text: 'Убрать админа', request_user: {request_id: 5, user_is_bot: false, request_name: true, request_username: true}}
        ])
    }
    return keyboard
}

const handleUserShared = (request_id, user_shared, from) => {
    console.log(`Handle user shared ${ JSON.stringify(user_shared)}`)
    switch (request_id) {
        case 1:
            db.addOperator({adderUsername: from, ...user_shared})
            return 'Оператор добавлен'
        case 2:
            db.removeOperator(user_shared.user_id)
            return 'Оператор удален'
        case 3:
            db.addAdmin({isSuper: false, adderUsername: from, ...user_shared})
            return 'Администратор добавлен'
        case 4:
            db.addAdmin({isSuper: true, adderUsername: from, ...user_shared})
            return 'Администратор добавлен'
        case 5:
            db.removeAdmin(user_shared.user_id)
            return 'Администратор удален'
    }
}

bot.on('message', msg => {
    

    try {
        const admin = db.getAdmins().find(ad => ad.id = msg.from.id)
        if (admin) {
            if (!admin.chat_id) {
                db.updateAdminChat(msg.from.id, msg.chat.id)
            }
            bot.sendMessage(admin.username, 'Test')

            let customMessage = undefined
            if (msg.users_shared?.users?.length) {
                customMessage = handleUserShared(msg.users_shared.request_id, msg.users_shared.users[0], msg.from.username)
            }
            return bot.sendMessage(msg.chat.id, customMessage ?? 'Меню администратора',
                {reply_markup: {
                    keyboard: getAdminKeyboard(admin.isSuper)
                }}
            )
        }

        const operator = db.getOperators().find(operator => operator.id === msg.from.id)
        if (operator) {
            if (!operator.chat_id) {
                db.updateOperatorChat(msg.from.id, msg.chat.id)
            }

            return bot.sendMessage(msg.chat.id, 'Ожидайте новых заявок. При появлении они автоматически распределяются между операторами.')
        }

        let state = db.getChatState(msg.chat.id)
        console.log(`Chat state: ${ state }`)
        if (state === undefined || state === null || Number.isNaN(state)) {
            state = 0
        }
        reply(msg, state)
            .then(newState => db.updateOrInsertChatState(msg.chat.id, newState))
    } catch (error) {
        console.error(error)
    }
    
})

