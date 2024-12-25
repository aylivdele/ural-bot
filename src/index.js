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
                `Здравствуйте! Для того, чтобы оставить заявку нужно предоставить номер телефона и почту.`,
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
                    `Для того, чтобы оставить заявку нужно предоставить номер телефона и почту.`,
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
                        remove_keyboard: true,
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
            db.updateRequest({chat_id: msg.chat.id, description: msg.text, status: 'NEW'})

            return bot.sendMessage(msg.chat.id, 
                'Спасибо! С вами свяжется наш оператор!',
                {reply_markup: {
                    remove_keyboard: true,
                }}
            ).then(() => 4, () => state)
        case 4:
        default:
            return reply(2)

    }
}

bot.on('message', msg => {
    try {
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