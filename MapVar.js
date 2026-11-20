/*:
 * @target MZ
 * @plugindesc 更好的变量系统！以地图的树状结构划分作用域
 * @author Anakah
 *
 * @help 
 * js接口：
 * MapVar.name
 * 获取变量，从内层作用域向外寻找
 * MapVar.name = value
 * 设置变量，从内层作用域向外寻找
 * 
 * 备注功能：
 * 地图备注中，在本插件的标签内，可以声明局部变量和全局变量，如下
 * <MapVar>
 * var1 = 0
 * var2 = [true, 2, "3"]
 * </MapVar>
 * <MapVar:global>
 * var3 = {"field": 1}
 * var4 = {\
 *   "a": 1,\
 *   "b": 2\
 * }
 * </MapVar>
 * 可以用任意json文本给变量设定初始值
 * 
 * 转义功能：
 * 用\MV[]转义符号插入变量
 * 
 * @url https://space.bilibili.com/3706998411496122
 * 
 * @param warning
 * @text 同名警告
 * @desc 内层变量与外层同名时在控制台警告
 * @type boolean
 * @default true
 */

(() => {
    class MapVarError extends Error {}

    const params = PluginManager.parameters('MapVar');
    params.warning = (() => {
        switch (params.warning) {
            case 'true':
                return true;
            case 'false':
                return false;
            default:
                throw new MapVarError(`Parameter error: warning=${params.warning}`)
        }
    })();

    // 变量系统
    const _DataManager_createGameObjects = DataManager.createGameObjects;
    DataManager.createGameObjects = function() {
        _DataManager_createGameObjects.call(this);
        window._MapVarTool._vars = {'0': {}};
    }

    const getMapVar = () => window._MapVarTool._vars;

    const _make = DataManager.makeSaveContents;
    DataManager.makeSaveContents = function() {
        const c = _make.call(this);
        c._MapVar_anakah = getMapVar();
        return c;
    };

    const _extract = DataManager.extractSaveContents;
    DataManager.extractSaveContents = function(contents) {
        _extract.call(this, contents);
        window._MapVarTool._vars = contents._MapVar_anakah;
    };

    function mapParent(id) {
        const info = $dataMapInfos[id];
        if (info === undefined) throw new MapVarError(`Map id ${id} does not exists`);
        return info.parentId;
    }

    function findScopeId(name, id) {
        const scope = getMapVar()[String(id)];
        if ((scope === undefined) || (scope[name] === undefined)) {
            if (id === 0) return null;
            return findScopeId(name, mapParent(id));
        } else return id;
    }

    function findAllId(name, id) {
        const ret = [id];
        let scopeId = findScopeId(name, id);
        while (true) {
            if (scopeId === null) break;
            ret.push(scopeId);
            if (scopeId === 0) break;
            scopeId = findScopeId(name, mapParent(scopeId));
        }
        return ret;
    }

    function findScope(name, id) {
        const scopeId = findScopeId(name, id);
        if (scopeId === null) return null
        else return getMapVar()[String(scopeId)];
    }

    function decl(name, value, id) {
        if (value === undefined) throw new MapVarError('Can not has undefined parameter');
        if (params.warning) {
            const foundId = findScopeId(name, id);
            if (foundId !== null && foundId !== id) {
                const allId = findAllId(name, id);
                console.warn(`[MapVar] 相同变量名 ${name} 于作用域ID: ${allId}`);
            }
        }
        const scope = getMapVar()[String(id)];
        if (scope === undefined) {
            getMapVar()[String(id)] = {[name]: value};
        } else {
            if (scope[name] === undefined) {
                scope[name] = value;
            }
        }
    }

    window._MapVarTool = {
        declGlobal: function(name, value = 0) {
            decl(name, value, 0);
        },
        decl: function(name, value = 0) {
            decl(name, value, $gameMap.mapId());
        },
        get: function(name) {
            const scope = findScope(name, $gameMap.mapId());
            if (scope !== null) return scope[name]
            else throw new MapVarError(`Variable ${name} does not exists`);
        },
        set: function(name, value) {
            if (value === undefined) throw new MapVarError('Can not has undefined parameter');
            const scope = findScope(name, $gameMap.mapId());
            if (scope !== null) scope[name] = value
            else throw new MapVarError(`Variable ${name} does not exists`);
        }
    };

    // Proxy包装
    window.MapVar = new Proxy({}, {
        set: function(target, key, value) {
            window._MapVarTool.set(key, value);
        },
        get: function(target, key) {
            return window._MapVarTool.get(key);
        }
    });

    // 用备注快捷声明
    function execNote(note, pattern, id) {
        for (const match of note.matchAll(pattern)) {
            const content = match[1].replace(/\\\s*\r?\n/g, '');
            const lines = content.split(/\r?\n/);
            for (const i of lines) {
                if (!i.trim()) continue;
                const idx = i.indexOf('=');
                if (idx === -1) throw new MapVarError('When parsing note, can not find "="');
                let data;
                try {
                    data = JSON.parse(i.slice(idx + 1).trim());
                } catch (e) {
                    throw new MapVarError('When parsing note, JSON parsing error');
                }
                decl(i.slice(0, idx).trim(), data, id);
            }
        }
    }

    const _Game_Map_setup = Game_Map.prototype.setup;
    Game_Map.prototype.setup = function(mapId) {
        _Game_Map_setup.call(this, mapId);
        const note = $dataMap.note;
        if (note === undefined) return;
        const pattern = /<MapVar>([\s\S]*?)<\/MapVar>/g
        execNote(note, pattern, mapId);
        const globalPattern = /<MapVar:global>([\s\S]*?)<\/MapVar>/g
        execNote(note, globalPattern, 0);
    };

    // 变量插入功能
    const _Window_Base_convertEscapeCharacters = Window_Base.prototype.convertEscapeCharacters;
    Window_Base.prototype.convertEscapeCharacters = function(text) {
        text = _Window_Base_convertEscapeCharacters.call(this, text);

        const pattern = /\x1bMV\[([\s\S]*?)\]/gi;
        text = text.replace(pattern, (match, name) => {
            try {
                return String(window._MapVarTool.get(name));
            } catch (error) {
                console.warn(`[MapVar] 转义失败: ${error.message}`);
                return match;
            }
        });

        return text;
    };
})();
