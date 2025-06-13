"use strict";
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __setFunctionName = (this && this.__setFunctionName) || function (f, name, prefix) {
    if (typeof name === "symbol") name = name.description ? "[".concat(name.description, "]") : "";
    return Object.defineProperty(f, "name", { configurable: true, value: prefix ? "".concat(prefix, " ", name) : name });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebsocketService = void 0;
var core_1 = require("@angular/core");
var rxjs_1 = require("rxjs");
var socket_io_client_1 = require("socket.io-client");
var WebsocketService = function () {
    var _classDecorators = [(0, core_1.Injectable)({
            providedIn: 'root'
        })];
    var _classDescriptor;
    var _classExtraInitializers = [];
    var _classThis;
    var WebsocketService = _classThis = /** @class */ (function () {
        function WebsocketService_1() {
            this.messageSubject = new rxjs_1.Subject();
            this.connectionStatus = new rxjs_1.BehaviorSubject(false);
            this.threadId = '';
            this.threadId = this.generateThreadId();
        }
        WebsocketService_1.prototype.generateThreadId = function () {
            return 'angular-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
        };
        WebsocketService_1.prototype.connect = function (serverUrl) {
            var _this = this;
            if (serverUrl === void 0) { serverUrl = 'http://localhost:8001'; }
            this.socket = (0, socket_io_client_1.io)(serverUrl, {
                query: {
                    threadId: this.threadId
                }
            });
            this.socket.on('connect', function () {
                console.log('Socket.IO connection opened with threadId:', _this.threadId);
                _this.connectionStatus.next(true);
            });
            this.socket.on('system_message', function (data) {
                console.log('System message received:', data);
                _this.messageSubject.next({ message: data.message });
            });
            this.socket.on('agent_response', function (data) {
                console.log('Agent response received:', data);
                _this.messageSubject.next({ response: data.response });
            });
            this.socket.on('error_message', function (data) {
                console.error('Error message received:', data);
                _this.messageSubject.next({ error: data.message });
            });
            this.socket.on('disconnect', function () {
                console.log('Socket.IO connection closed');
                _this.connectionStatus.next(false);
            });
            this.socket.on('connect_error', function (error) {
                console.error('Socket.IO connection error:', error);
                _this.connectionStatus.next(false);
            });
        };
        WebsocketService_1.prototype.sendMessage = function (query) {
            if (this.socket && this.socket.connected) {
                this.socket.emit('user_query', { query: query });
                console.log('Socket.IO message sent:', query);
            }
            else {
                console.error('Socket.IO is not connected. Message not sent:', query);
                this.messageSubject.next({ error: 'Connessione non disponibile. Riprova.' });
            }
        };
        WebsocketService_1.prototype.getMessages = function () {
            return this.messageSubject.asObservable();
        };
        WebsocketService_1.prototype.getConnectionStatus = function () {
            return this.connectionStatus.asObservable();
        };
        WebsocketService_1.prototype.disconnect = function () {
            if (this.socket) {
                this.socket.disconnect();
            }
        };
        return WebsocketService_1;
    }());
    __setFunctionName(_classThis, "WebsocketService");
    (function () {
        var _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        WebsocketService = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return WebsocketService = _classThis;
}();
exports.WebsocketService = WebsocketService;
