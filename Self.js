/*:
 * @target MZ
 * @plugindesc 接口非常方便好用的自身变量插件
 * @author Anakah
 *
 * @help 
 * js接口：
 * Self.var
 * 读取变量
 * Self.var = value
 * 设置变量
 * 
 * 指令功能：
 * 在“初始化自身变量”指令中用特定格式声明变量
 * var1 = 1
 * var2 = "str"
 * var3 = [1, 2, 3]
 * var4 = {\
 *   "a": 1\
 * }
 * 
 * 转义功能：
 * 用\S[]转义符号插入变量
 * 
 * @url https://space.bilibili.com/3706998411496122
 * 
 * @command initVar
 * @text 初始化自身变量
 * @desc 为自身变量赋值，执行一次后保证再不执行（事件一旦执行过一条此指令，不再执行其他同属此指令的指令，故最好只有一个此指令）
 * 
 * @arg varDecl
 * @text 变量声明
 * @type multiline_string
 */

(() => {
    class SelfError extends Error {}

    // 数据持久化
    const _DataManager_createGameObjects = DataManager.createGameObjects;
    DataManager.createGameObjects = function() {
        _DataManager_createGameObjects.call(this);
        window._Self_anakah = {};
    }

    const _make = DataManager.makeSaveContents;
    DataManager.makeSaveContents = function() {
        const c = _make.call(this);
        c._Self_anakah = window._Self_anakah;
        return c;
    }

    const _extract = DataManager.extractSaveContents;
    DataManager.extractSaveContents = function(contents) {
        _extract.call(this, contents);
        window._Self_anakah = contents._Self_anakah;
    }

    // 供用户使用的接口
    window.Self = new Proxy({}, {
        set: function(target, key, value) {
            const mapId = $gameMap.mapId();
            const eventId = $gameMap._interpreter.eventId();
            const store = window._Self_anakah;
            if (store[mapId] === undefined) store[mapId] = {};
            if (store[mapId][eventId] === undefined) store[mapId][eventId] = {};
            if (value === undefined) throw new SelfError(`Can not assign undefined to self var ${key}`);
            store[mapId][eventId][key] = value;
            return true;
        },
        get: function(target, key) {
            const mapId = $gameMap.mapId();
            const eventId = $gameMap._interpreter.eventId();
            const store = window._Self_anakah;
            const scope = store[mapId]?.[eventId]
            if (scope === undefined) throw new SelfError(`Self var ${key} has not been assigned`);
            return scope[key];
        }
    });

    // 变量声明指令
    function parse(text, func) {
        const content = text.replace(/\\\s*\r?\n/g, '');
        const lines = content.split(/\r?\n/);
        for (const i of lines) {
            if (!i.trim()) continue;
            const idx = i.indexOf('=');
            if (idx === -1) throw new SelfError('When parsing self var declaration, can not find "="');
            let data;
            try {
                data = JSON.parse(i.slice(idx + 1).trim());
            } catch (e) {
                throw new SelfError('When parsing self var declaration, JSON parsing error');
            }
            func(i.slice(0, idx).trim(), data);
        }
    }

    PluginManager.registerCommand('Self', 'initVar', (args) => {
        try {Self.__initialized__} catch (e) {
            const text = args.varDecl;
            parse(text, (name, value) => {
                window.Self[name] = value;
            });
            Self.__initialized__ = true;
        }
    });

    // 变量插入功能
    const _Window_Base_convertEscapeCharacters = Window_Base.prototype.convertEscapeCharacters;
    Window_Base.prototype.convertEscapeCharacters = function(text) {
        text = _Window_Base_convertEscapeCharacters.call(this, text);

        const pattern = /\x1bS\[([\s\S]*?)\]/gi;
        text = text.replace(pattern, (match, name) => {
            try {
                return String(window.Self[name]);
            } catch (error) {
                console.warn(`[Self] 转义失败: ${error.message}`);
                return match;
            }
        });

        return text;
    };
})();
