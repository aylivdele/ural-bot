const Loki = require('lokijs')
const { v4: uuidv4 } = require('uuid')

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
        this.admins = this.getCollection('admins')
        this.operators = this.getCollection('operators')

        this.initialized = true
        console.log("Database initialized!")

        if (!this.getAdmins().some(admin => admin.id === 387051080)) {
            const admin = this.addAdmin({
                user_id: 387051080,
                isSuper: true,
                date: 1,
                adderUsername: "aylivdele",
                first_name: "Илья",
                last_name: "Рассомахин",
                username: "aylivdele",
            })

            bot.sendMessage(admin.username, 'Test')
        }

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
            email,
        }
    ) {
        this.checkInit()

        let contact = this.contacts.by('id', chat_id)
        if (contact) {
            console.log(`Update contact for ${chat_id}`)

            contact.phone_number = phone_number ?? contact.phone_number
            contact.first_name = first_name ?? contact.first_name
            contact.last_name = last_name ?? contact.last_name
            contact.user_id = user_id ?? contact.user_id
            contact.email = email ?? contact.email

            this.contacts.update(contact)
        } else {
            contact = this.contacts.insert({
                id: chat_id,
                phone_number,
                first_name,
                last_name,
                user_id,
                email,
            })
            console.log(`Insert contact for ${chat_id}: ${contact}`)
        }
    }

    getContact(
        chat_id
    ) {
        this.checkInit()
        
        return this.contacts.by('id', chat_id)
    }

    getRequestsByChatId(
        chat_id,
    ) {
        return this.requests.where(r => r.chat_id === chat_id)
    }

    updateRequest(
        id,
        {
            chat_id,
            description,
            status,
            operator,
        }
    ) {
        this.checkInit()

        if (id) {
            console.log(`Update request for ${chat_id}`)

            let request = this.requests.by('id', id)

            request.chat_id = chat_id ?? request.chat_id
            request.description = description ?? request.description,
            request.status = status ?? request.status,
            request.operator = operator ?? request.operator,

            this.requests.update(request)
        } else {
            do {
                id = uuidv4()
            } while (
                this.requests.by('id', id)
            )

            let request = this.requests.insert({
                id,
                chat_id,
                description,
                status,
                operator,
            })
            console.log(`Insert request for ${chat_id}: ${request}`)
        }
    }

    getAdmins() {
        return this.admins.where(() => true)
    }

    getOperators() {
        return this.operators.where(() => true)
    }

    addOperator({
        user_id,
        first_name,
        last_name,
        username,
        adderUsername,
    }) {
        let operator = this.operators.by('id', user_id)

        console.log(`Add operator ${ username } by ${ adderUsername }`)
        if (operator) {
            return operator
        }
        return this.operators.insert({
            id: user_id,
            adder: adderUsername,
            date: Date.now(),
            first_name,
            last_name,
            username,
        })
    }

    removeOperator(
        id
    ) {
        return this.operators.findAndRemove({'id' : {'$eq' : id}})
    }

    addAdmin({
        user_id,
        first_name,
        last_name,
        username,
        isSuper,
        adderUsername,
    }) {
        let admin = this.admins.by('id', user_id)

        console.log(`Add admin ${ username } by ${ adderUsername }`)
        if (admin) {
            return admin
        }
        return this.admins.insert({
            id: user_id,
            isSuper: isSuper ?? false,
            adder: adderUsername,
            date: Date.now(),
            first_name,
            last_name,
            username,
        })
    }

    removeAdmin(
        id,
    ) {
        return this.admins.findAndRemove({'id' : {'$eq' : id}})
    }
}

module.exports = LocalDatabase