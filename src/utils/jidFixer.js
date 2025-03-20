/**
 * JID Fixer Utility
 * Prevents "jid.endsWith is not a function" error by ensuring JIDs are strings
 */

/**
 * Ensure a JID (Jabber ID) is a valid string before using string methods on it
 * @param {any} jid - The JID to validate and convert to string if needed
 * @returns {string} - The JID as a string, or empty string if undefined/null
 */
function ensureJidString(jid) {
    if (jid === null || jid === undefined) return '';
    
    // If jid is already a string, return it
    if (typeof jid === 'string') return jid;
    
    // Try to convert to string
    try {
        return String(jid);
    } catch (err) {
        console.error('Failed to convert JID to string:', err);
        return '';
    }
}

module.exports = {
    ensureJidString
};