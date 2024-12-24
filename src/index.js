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

bot.on('message', msg => {
    try {
        const state = db.getChatState(msg.chat.id)
        console.log(`Chat state: ${ state }`)
        db.updateOrInsertChatState(msg.chat.id, state + 1 ?? 1)
        bot.sendMessage(msg.chat.id, `Reply to '${ msg.text }'`, { reply_to_message_id: msg.message_id})
    } catch (error) {
        console.error(error)
    }
    
})