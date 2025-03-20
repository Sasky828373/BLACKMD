/**
 * Bot Response Handler
 * Manages message formatting and response generation
 */

const logger = require('../utils/logger');

class ResponseHandler {
    constructor(config = {}) {
        this.config = {
            defaultLanguage: 'en',
            formatMessages: true,
            useEmoji: true,
            maxRetries: 3,
            ...config
        };

        this.templates = new Map();
        this.responseQueue = new Map();
        this.retryDelays = [1000, 2000, 5000]; // Progressive delays
    }

    async sendResponse(socket, to, content, options = {}) {
        const messageId = `${to}_${Date.now()}`;
        let retries = 0;

        const send = async () => {
            try {
                const formattedContent = this.formatContent(content, options);
                const message = {
                    ...formattedContent,
                    contextInfo: {
                        ...options.contextInfo,
                        isForwarded: false,
                        forwardingScore: 0
                    }
                };

                const sent = await socket.sendMessage(to, message, { ...options });
                this.responseQueue.delete(messageId);
                return sent;

            } catch (error) {
                if (retries < this.config.maxRetries) {
                    retries++;
                    const delay = this.retryDelays[retries - 1] || this.retryDelays[this.retryDelays.length - 1];
                    
                    logger.warn(`Retry ${retries}/${this.config.maxRetries} sending message to ${to} in ${delay}ms`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    
                    return send();
                }
                
                throw error;
            }
        };

        this.responseQueue.set(messageId, { to, content, options, timestamp: Date.now() });
        return send();
    }

    formatContent(content, options = {}) {
        if (typeof content === 'string') {
            return { text: this.formatText(content, options) };
        }

        if (content.text) {
            content.text = this.formatText(content.text, options);
        }

        return content;
    }

    formatText(text, options = {}) {
        if (!this.config.formatMessages) return text;

        let formatted = text;

        // Apply text formatting
        if (options.bold) {
            formatted = `*${formatted}*`;
        }
        if (options.italic) {
            formatted = `_${formatted}_`;
        }
        if (options.monospace) {
            formatted = `\`\`\`${formatted}\`\`\``;
        }

        // Add emoji decorations
        if (this.config.useEmoji && options.emoji) {
            formatted = `${options.emoji} ${formatted}`;
        }

        return formatted;
    }

    async sendTemplate(socket, to, templateName, data = {}, options = {}) {
        const template = this.templates.get(templateName);
        if (!template) {
            throw new Error(`Template '${templateName}' not found`);
        }

        const content = this.processTemplate(template, data);
        return this.sendResponse(socket, to, content, options);
    }

    processTemplate(template, data) {
        if (typeof template === 'function') {
            return template(data);
        }

        let processed = template;
        for (const [key, value] of Object.entries(data)) {
            const placeholder = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
            processed = processed.replace(placeholder, value);
        }

        return processed;
    }

    registerTemplate(name, template) {
        this.templates.set(name, template);
    }

    async replyToMessage(socket, message, content, options = {}) {
        const quoted = {
            key: message.key,
            message: message.message
        };

        return this.sendResponse(socket, message.key.remoteJid, content, {
            ...options,
            quoted
        });
    }

    async sendTyping(socket, to, duration = 1000) {
        try {
            await socket.sendPresenceUpdate('composing', to);
            await new Promise(resolve => setTimeout(resolve, duration));
            await socket.sendPresenceUpdate('paused', to);
        } catch (error) {
            logger.error('Error sending typing indicator:', error);
        }
    }

    getQueueStatus() {
        const now = Date.now();
        return Array.from(this.responseQueue.entries()).map(([id, data]) => ({
            id,
            to: data.to,
            age: now - data.timestamp,
            contentType: typeof data.content === 'string' ? 'text' : Object.keys(data.content)[0]
        }));
    }
}

module.exports = ResponseHandler;
