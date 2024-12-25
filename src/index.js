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
            bot.sendMessage(msg.chat.id, 
                `Здравствуйте! Для того, чтобы оставить заявку нужно предоставить номер телефона и почту.`,
                {reply_markup: {
                    keyboard: [[{request_contact: true}]],
                    is_persistent: true,
                    one_time_keyboard: true,
                }}
            )
            return 1
        case 1:
            if (msg.contact) {
                db.updateContact(
                    msg.chat.id,
                    msg.contact,
                )
                bot.sendMessage(msg.chat.id, 
                    'Теперь введите свою почту.',
                    {reply_markup: {
                        force_reply: true,
                        input_field_placeholder: "example@mail.ru",
                        remove_keyboard: true,
                    }}
                )
                return 2
            } else {
                bot.sendMessage(msg.chat.id, 
                    `Для того, чтобы оставить заявку нужно предоставить номер телефона и почту.`,
                    {reply_markup: {keyboard: [[{request_contact: true}]]}}
                )
                return 1
            }
        case 2:
            const hasEmail = !!db.getContact(msg.chat.id)?.email;
            if (validateEmail(msg.text) || hasEmail) {
                if (!hasEmail) {
                    updateContact(msg.chat.id, {email: msg.text})
                }
                bot.sendMessage(msg.chat.id, 
                    `Пожалуйста, оставьте описание вашей заявки.`,
                    {reply_markup: {
                        remove_keyboard: true,
                        force_reply: true,
                        input_field_placeholder: 'Хочу купить автомобиль!'
                    }}
                )
                return 3
            } else {
                bot.sendMessage(msg.chat.id, 
                    'Пожалуйста, введите корректную почту.',
                    {reply_markup: {
                        force_reply: true,
                        input_field_placeholder: "example@mail.ru",
                        remove_keyboard: true,
                    }}
                )
                return 2
            }
        case 3:
            bot.sendMessage(msg.chat.id, 
                'Спасибо! С вами свяжется наш оператор!',
                {reply_markup: {
                    remove_keyboard: true,
                }}
            )
            db.updateRequest({chat_id: msg.chat.id, description: msg.text, status: 'NEW'})
            return 4
        case 4:
        default:
            return reply(2)

    }
}

bot.on('message', msg => {
    try {
        const state = db.getChatState(msg.chat.id)
        console.log(`Chat state: ${ state }`)
        if (state === undefined || state === null || Number.isNaN(state)) {
            state = 0
        }
        const newState = reply(msg, state)
        db.updateOrInsertChatState(msg.chat.id, newState)
    } catch (error) {
        console.error(error)
    }
    
})