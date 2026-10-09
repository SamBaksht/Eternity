function BMK(num, additionalDecimalPoints = 0 ) {
    let negative = num < 0;
    num = Math.abs(num);
    let thingy;
    if (num >= 1000000000) {
        thingy = (num / 1000000000).toFixed(1 + additionalDecimalPoints) + 'B';
    } else if (num >= 1000000) {
        thingy = (num / 1000000).toFixed(1 + additionalDecimalPoints) + 'M';
    } else if (num >= 1000) {
        thingy = (num / 1000).toFixed(1 + additionalDecimalPoints) + 'K';
    } else {
        thingy = num.toString();
    }
    return `${negative ? '-' : ''}${thingy}`;
}

function styleText(message) {
    const colors = {
        '§1': '\x1b[34m', // Dark Blue
        '§2': '\x1b[32m', // Dark Green
        '§3': '\x1b[36m', // Cyan
        '§4': '\x1b[31m', // Dark Red
        '§5': '\x1b[35m', // Magenta
        '§6': '\x1b[33m', // Gold
        '§9': '\x1b[94m', // light blue
        '§8': '', // dark gray
        '§7': '\x1b[36m', // Cyan (Darker Blue)
        '§f': '\x1b[36m', // Cyan (Darker Blue)
        '§k': '\x1b[5m',  // Magic (not supported in all terminals)
        '§l': '\x1b[1m',  // Bold
        '§m': '\x1b[9m',  // Strikethrough
        '§n': '\x1b[4m',  // Underline
        '§o': '\x1b[3m',  // Italic
        '§d': '\x1b[95m', // light magenta
        '§a': '\x1b[92m', // light green
        '§e': '\x1b[93m', // Yellow
        '§r': '\x1b[0m', // Reset
        '§b': '\x1b[94m', // Light Blue
        '§0': '\x1b[30m', // Black
        '§g': '\x1b[32m', // Green
        '§c': '\x1b[33m', // Yellow
        '§p': '\x1b[35m', // Magenta
        '§u': '\x1b[34m', // Blue
        '§i': '\x1b[36m', // Cyan
        '§w': '\x1b[37m', // White
    };
    for (const [key, value] of Object.entries(colors)) {
        message = message.split(key).join(value);
    }
    return message + colors['§r'];
}

/**
 * Extract all text from a prismarine-nbt text component (compound or string).
 * Structure: { type:'compound', value:{ text:{type:'string',value:'...'}, extra:{type:'list',value:{type:'compound',value:[...]}} } }
 */
function extractNbtText(nbtComp) {
    if (!nbtComp) return null;
    if (nbtComp.type === 'string') return nbtComp.value;
    if (typeof nbtComp === 'string') return nbtComp;
    if (nbtComp.type === 'compound' && nbtComp.value) {
        let result = nbtComp.value.text?.value ?? '';
        const extras = nbtComp.value.extra?.value?.value;
        if (Array.isArray(extras)) {
            for (const e of extras) {
                result += e.text?.value ?? '';
            }
        }
        return result;
    }
    return null;
}

/**
 * Extract the custom display name from a slot item.
 * Handles both component (1.20.5+) and legacy NBT formats.
 */
function getSlotCustomName(slot) {
    if (!slot) return null;
    const nameComp = slot.componentMap?.get('custom_name')?.data;
    if (nameComp) {
        const text = extractNbtText(nameComp);
        if (text) return text;
    }
    return slot?.nbt?.value?.display?.value?.Name?.value ?? null;
}

/**
 * Extract lore lines from a slot item.
 */
function getSlotLore(slot) {
    if (!slot) return null;
    const loreComp = slot.componentMap?.get('lore')?.data;
    if (loreComp && Array.isArray(loreComp)) {
        return loreComp.map(entry => extractNbtText(entry) ?? '');
    }
    return slot?.nbt?.value?.display?.value?.Lore?.value?.value ?? null;
}

/**
 * Extract the custom_data ExtraAttributes.id from a slot item.
 */
function unwrapNbtValue(value) {
    if (value == null) return null;
    if (typeof value !== 'object') return value;
    if (value.type === 'string' && value.value != null) return value.value;
    if (Object.prototype.hasOwnProperty.call(value, 'value')) return unwrapNbtValue(value.value);
    return value;
}

function findNestedId(node, depth = 0) {
    if (!node || depth > 8) return null;
    if (typeof node === 'string') return node;
    if (typeof node !== 'object') return null;

    const direct = unwrapNbtValue(node.id);
    if (typeof direct === 'string') return direct;

    const extraAttributes = unwrapNbtValue(node.ExtraAttributes);
    if (extraAttributes && extraAttributes !== node) {
        const nested = findNestedId(extraAttributes, depth + 1);
        if (nested) return nested;
    }

    const value = unwrapNbtValue(node.value);
    if (value && value !== node) {
        const nested = findNestedId(value, depth + 1);
        if (nested) return nested;
    }

    return null;
}

function getSlotItemTag(slot) {
    if (!slot) return null;
    const customData = slot.componentMap?.get('custom_data')?.data;
    if (customData) {
        const id = findNestedId(customData);
        if (id) return id;
    }
    return findNestedId(slot?.nbt?.value?.ExtraAttributes) ?? findNestedId(slot?.nbt?.value) ?? null;
}

module.exports = { BMK, styleText, extractNbtText, getSlotCustomName, getSlotLore, getSlotItemTag };
