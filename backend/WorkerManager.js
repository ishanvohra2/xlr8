class WorkerManager {
    constructor () {
      console.log(Pear.worker)
      this.pipe = Pear.worker.pipe()
    }
  
    setupMessageHandler (handleMessage) {
      this.pipe.on('data', async data => {
        try {
          await handleMessage(data)
        } catch (err) {
          console.error('[Worker] Error processing message:', err)
          this.sendMessage({ type: 'error', error: err.message })
        }
      })
    }
  
    sendMessage (message) {
      // Use length-prefixed protocol to handle large messages
      const jsonStr = JSON.stringify(message)
      const contentLength = Buffer.byteLength(jsonStr, 'utf-8')
      const header = `Content-Length: ${contentLength}\r\n\r\n`
      this.pipe.write(header + jsonStr)
    }
  
    setupCleanupHandler (cleanupHandler) {
      this.pipe.on('end', async () => {
        await cleanupHandler()
      })
    }
  }
  
  module.exports = {
    WorkerManager
  }
  