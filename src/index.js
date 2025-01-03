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

const db = new LocalDatabase()

const formatPhoneNumber = (number) => {
    const cleaned = ('' + number).replace(/\D/g, '')
    const match = cleaned.match(/^(\d{1,3})(\d{3})(\d{3})(\d{4})$/)
    if (match) {
        return '+' + match.splice(1).join('-')
    }
    return number
}

const interval = setInterval(() => {
    try {
        db.checkInit()
    } catch (error) {
        console.log('Not initialized')
    }
    let requests = db.getNewRequests()
    if (!requests?.length) {
        return
    }
    console.log("New requests: " + JSON.stringify(requests))
    
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
        const phoneNumber = formatPhoneNumber(contact.phone_number)
        const contactStr = 'Контактные данные:'
        const message = `Новый запрос:\n${request.description}\n${contactStr}\n${contact.last_name ?? ''} ${contact.first_name}\n${ phoneNumber }\n${contact.email}\n${contact.username ?? ''}`
        const entities = [
            {
                type: 'bold', offset:0, length: 13,
            },
            {
                type: 'bold', offset:message.indexOf(contactStr), length: contactStr.length,
            },
            {
                type: 'phone_number', offset: message.indexOf(phoneNumber), length: phoneNumber.length,
            }, {
                type: 'email', offset: message.indexOf(contact.email), length: contact.email.length,
            }
        ]
        if (contact.username?.length) {
            entities.push({
                type: 'mention', offset: message.indexOf(contact.username), length: contact.username.length,
            })
        }
        bot.sendMessage(operator.chat_id, message, { entities: entities, reply_markup: {
            inline_keyboard: [[
                {
                    text: 'Закрыть запрос', callback_data: 'closeREQUEST' + request.id,
                }
            ]]
        }}).catch(reason => {
            console.error(`Send message error`, reason)
            db.rollbackRequest(request.id)
            db.updateOperatorCount(operator.id, (operator.count ?? 1) - 1)
        })
    }
}, 20000)

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
                    {...msg.contact, username: msg.from.username},
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
            const countOfOpenRequests = requests.filter(r => r.status !== 'CLOSED').length
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
            {text: 'Добавить оператора', request_user: {request_id: 1, user_is_bot: false, request_name: true, request_username: true}},
            {text: 'Убрать оператора', request_user: {request_id: 2, user_is_bot: false, request_name: true, request_username: true}}
        ]
    ]
    if (isSuper) {
        keyboard.push([
            {text: 'Добавить админа', request_user: {request_id: 3, user_is_bot: false, request_name: true, request_username: true}},
            {text: 'Добавить супер админа', request_user: {request_id: 4, user_is_bot: false, request_name: true, request_username: true}},
            {text: 'Убрать админа', request_user: {request_id: 5, user_is_bot: false, request_name: true, request_username: true}}
        ],[
            {text: 'Список операторов'},
            {text: 'Список админов'}
        ],[
            {text: 'Рассылка'}
        ]
        )
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
// first_name,
// last_name,
// username,
// isSuper,
// adderUsername,
const getAllAdmins = () => {
    return db.getAdmins().map(admin => ([(admin.last_name ? admin.last_name + ' ': '') + admin.first_name, 
        admin.username, 
        admin.isSuper ? 'Супер админ' : undefined,
    ].filter(str => !!str).join('\n'))).join('\n\n')
}

const getAllOperators = () => {
    return db.getOperators().map(operator => ([(operator.last_name ? operator.last_name + ' ': '') + operator.first_name, 
        operator.username, 
    ].filter(str => !!str).join('\n'))).join('\n\n')
}

const media_map = {}

const onMedia = (msg, type, file_id) => {
    if (msg.reply_to_message?.text === 'Введите текст рассылки. Для отмены введите "отмена"') {
        if (msg.caption !== 'отмена') {
            if (msg.media_group_id) {
                bot.sendMessage(msg.chat.id, 'Обнаружено группа медиа файлов. Ожидаю их получения в течении минуты и начинаю рассылку.')
                let media_group = media_map[msg.media_group_id]
                if (media_group) {
                    media_group.media.push({
                        type: type,
                        media: file_id,
                        caption: msg.caption,
                        caption_entities: msg.caption_entities, 
                    })
                    return
                } else {
                    media_group = {}
                    media_map[msg.media_group_id] = media_group
                    media_group.timeout = setTimeout(() => {
                            bot.sendMessage(msg.chat.id, 'Рассылка в процессе...', {
                                reply_markup: {
                                    keyboard: getAdminKeyboard(admin.isSuper)
                                }})
                                .then(sent_message => 
                                    Promise.allSettled(
                                        db.getAllUserChats().map(chat => bot.sendMediaGroup(chat, media_group.media))
                                    ).then(results => {
                                        const countFulfilled = results.filter(result => result.status === 'fulfilled').length
                                        bot.sendMessage(msg.chat.id, `Успешно отправлено ${countFulfilled} из ${results.length} пользователям.`)
                                    })
                                ) 
                        }, 60000)
                    media_group.media = [{
                        type: type,
                        media: file_id,
                        caption: msg.caption,
                        caption_entities: msg.caption_entities, 
                    }]
                    return
                }
            } else {
                return bot.sendMessage(msg.chat.id, 'Рассылка в процессе...', {
                    reply_markup: {
                        keyboard: getAdminKeyboard(admin.isSuper)
                    }})
                    .then(sent_message => 
                        Promise.allSettled(
                            db.getAllUserChats().map(chat => {
                                switch (type) {
                                    case 'photo':
                                        return bot.sendPhoto(chat, file_id,{caption: msg.caption, caption_entities: msg.caption_entities})
                                    case 'video':
                                        return bot.sendVideo(chat, file_id,{caption: msg.caption, caption_entities: msg.caption_entities})
                                    case 'audio':
                                        return bot.sendAudio(chat, file_id,{caption: msg.caption, caption_entities: msg.caption_entities})
                                    default:
                                        return Promise.reject('Unsupported media type') 
                                }
                            })
                        ).then(results => {
                            const countFulfilled = results.filter(result => result.status === 'fulfilled').length
                            bot.sendMessage(msg.chat.id, `Успешно отправлено ${countFulfilled} из ${results.length} пользователям.`)
                        })
                    ) 
            }
        }
        return                    
    } else {

    }
}


bot.on('photo', msg => {
    try {
        console.log(`Processing photo with text: "${msg.caption}"`)
        const admin = db.getAdmins().find(ad => ad.id === msg.from.id)
        if (admin) {
            onMedia(msg, 'photo', msg.photo[0].file_id)
        }
    } catch(e) {
        console.error(e)
    }
})

bot.on('video', msg => {
    try {
        console.log(`Processing vedio with text: "${msg.caption}"`)
        const admin = db.getAdmins().find(ad => ad.id === msg.from.id)
        if (admin) {
            onMedia(msg, 'video', msg.video.file_id)
        }
    } catch(e) {
        console.error(e)
    }
})

bot.on('audio', msg => {
    try {
        console.log(`Processing audio with text: "${msg.caption}"`)
        const admin = db.getAdmins().find(ad => ad.id === msg.from.id)
        if (admin) {
            onMedia(msg, 'audio', msg.audio.file_id)
        }
    } catch(e) {
        console.error(e)
    }
})

bot.on('message', msg => {
    try {
        console.log(`Processing message with text: "${msg.text}"`)
        if (msg.text?.startsWith('/start')) {
            db.addChat(msg.chat.id, msg.from.id)
        }
        const admin = db.getAdmins().find(ad => ad.id === msg.from.id)
        if (admin) {
            if (!admin.chat_id) {
                db.updateAdminChat(msg.from.id, msg.chat.id)
            }

            if (msg.text === 'Список операторов') {
                return bot.sendMessage(msg.chat.id, getAllOperators(),
                {reply_markup: {
                    keyboard: getAdminKeyboard(admin.isSuper)
                }})
            }
            if (msg.text === 'Список админов') {
                return bot.sendMessage(msg.chat.id, getAllAdmins(),
                {reply_markup: {
                    keyboard: getAdminKeyboard(admin.isSuper)
                }})
            }
            if (msg.text === 'Рассылка') {
                return bot.sendMessage(msg.chat.id, 'Введите текст рассылки. Для отмены введите "отмена"',
                {reply_markup: {
                    force_reply: true,
                    input_field_placeholder: "Текст рассылки",
                }})
            }
            if (msg.reply_to_message?.text === 'Введите текст рассылки. Для отмены введите "отмена"') {
                if (msg.text && msg.text !== 'отмена') {
                    return bot.sendMessage(msg.chat.id, 'Рассылка в процессе...', {
                        reply_markup: {
                            keyboard: getAdminKeyboard(admin.isSuper)
                        }})
                        .then(sent_message => 
                            Promise.allSettled(
                                db.getAllUserChats().map(chat => bot.sendMessage(chat, msg.text))
                            ).then(results => {
                                const countFulfilled = results.filter(result => result.status === 'fulfilled').length
                                bot.sendMessage(msg.chat.id, `Успешно отправлено ${countFulfilled} из ${results.length} пользователям.`)
                            })
                        )                    
                }
            }

            let customMessage = undefined
            if (msg.users_shared?.users?.length) {
                customMessage = handleUserShared(msg.users_shared.request_id, msg.users_shared.users[0], msg.from.username)
            }
            return bot.sendMessage(msg.chat.id, customMessage ?? 'Выберите команду из меню кнопок',
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

