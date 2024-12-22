

module.exports = class LocalDatabase {

    initialized = false

    LocalDatabase() {
        const dbPath = process.env.DATABASE_PATH

        if (!dbPath) {
            throw Error("DATABASE_PATH is empty")
        }
        this.db = new Loki(dbPath, {
            autoload: true,
            autoloadCallback : this.databaseInitialize,
            autosave: true, 
            autosaveInterval: 4000
        })
    }

    databaseInitialize() {
        this.states = getCollection('states')
        this.contacts = getCollection('contacts')
        this.requests = getCollection('requests')

        this.initialized = true
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
        if (!chatState) {
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
}