const TelegramBot = require('node-telegram-bot-api');

require('dotenv').config()


const token = process.env.API_TOKEN
const url = process.env.URL

const bot = new TelegramBot(token, {
    webHook: {
        port: process.env.PORT,
        autoOpen: false,
    }
})

if (token && url) {
    bot.openWebHook();
    bot.setWebHook(`${url}/bot${token}`)
} else {
    console.error('Token or URL not specified')
}

bot.on('message', msg => {
    bot.sendMessage(msg.chat.id, `Reply to '${ msg.text }'`, { reply_to_message_id: msg.message_id});
})