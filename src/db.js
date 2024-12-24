const Loki = require('lokijs')

class LocalDatabase {

    initialized = false

    constructor() {
        const dbPath = process.env.DATABASE_PATH

        if (!dbPath) {
            throw Error("DATABASE_PATH is empty")
        }
        this.db = new Loki(dbPath, {
            autoload: true,
            autoloadCallback : this.databaseInitialize,
            autosave: true, 
            autosaveInterval: 4000,
            adapter: new Loki.LokiFsAdapter(),
        })
    }

    databaseInitialize = () => {
        console.log("Database initializing...")

        this.states = this.getCollection('states')
        this.contacts = this.getCollection('contacts')
        this.requests = this.getCollection('requests')

        this.initialized = true
        console.log("Database initialized!")

    }

    getCollection(collectionName) {
        const collection = this.db.getCollection(collectionName)
        if (collection === null) {
            return this.db.addCollection(collectionName, {
                unique: ["id"],
            })
        }
        return collection
    }

    checkInit() {
        if (!this.initialized) {
            throw Error("Database not yet initialized")
        }
    }

    getChatState(
        chat_id,
    ) {
        this.checkInit()
        
        return this.states.by('id', chat_id)?.state
    }

    updateOrInsertChatState(
        chat_id,
        state,
    ) {
        this.checkInit()

        let chatState = this.states.by('id', chat_id)
        if (chatState) {
            console.log(`Update state for ${chat_id}: ${chatState.state} => ${state}`)
            chatState.state = state
            this.states.update(chatState)
        } else {
            console.log(`Insert state for ${chat_id}: ${state}`)
            this.states.insert({
                id: chat_id,
                state: state,
            })
        }
    }

    updateContact(
        chat_id,
        {
            phone_number,
            first_name,
            last_name,
            user_id,
        }
    ) {
        this.checkInit()

        let contact = this.contacts.by('id', chat_id)
        if (contact) {
            console.log(`Update contact for ${chat_id}`)

            contact.phone_number = phone_number
            contact.first_name = first_name
            contact.last_name = last_name
            contact.user_id = user_id

            this.contacts.update(contact)
        } else {
            contact = this.contacts.insert({
                id: chat_id,
                phone_number,
                first_name,
                last_name,
                user_id,
            })
            console.log(`Insert contact for ${chat_id}: ${contact}`)
        }
    }

    updateRequest(
        chat_id,
        {
            description,
            status,
            operator,
        }
    ) {
        this.checkInit()

        let request = this.requests.by('id', chat_id)
        if (request) {
            console.log(`Update request for ${chat_id}`)

            request.description = description ?? request.description,
            request.status = status ?? request.status,
            request.operator = operator ?? request.operator,

            this.requests.update(request)
        } else {
            request = this.requests.insert({
                id: chat_id,
                description,
                status,
                operator,
            })
            console.log(`Insert request for ${chat_id}: ${request}`)
        }
    }
}

module.exports = LocalDatabase