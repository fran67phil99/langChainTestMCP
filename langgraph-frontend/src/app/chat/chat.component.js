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
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __setFunctionName = (this && this.__setFunctionName) || function (f, name, prefix) {
    if (typeof name === "symbol") name = name.description ? "[".concat(name.description, "]") : "";
    return Object.defineProperty(f, "name", { configurable: true, value: prefix ? "".concat(prefix, " ", name) : name });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatComponent = void 0;
var core_1 = require("@angular/core");
var marked_1 = require("marked");
var ChatComponent = function () {
    var _classDecorators = [(0, core_1.Component)({
            selector: 'app-chat',
            templateUrl: './chat.component.html',
            styleUrls: ['./chat.component.css'],
            standalone: false
        })];
    var _classDescriptor;
    var _classExtraInitializers = [];
    var _classThis;
    var _messagesContainer_decorators;
    var _messagesContainer_initializers = [];
    var _messagesContainer_extraInitializers = [];
    var ChatComponent = _classThis = /** @class */ (function () {
        function ChatComponent_1(websocketService, sanitizer) {
            this.websocketService = websocketService;
            this.sanitizer = sanitizer;
            this.messagesContainer = __runInitializers(this, _messagesContainer_initializers, void 0);
            this.messages = (__runInitializers(this, _messagesContainer_extraInitializers), []);
            this.newMessage = '';
            this.isConnected = false;
            this.isTyping = false;
            // Configura marked per il parsing markdown
            marked_1.marked.setOptions({
                breaks: true,
                gfm: true
            });
        }
        ChatComponent_1.prototype.ngOnInit = function () {
            var _this = this;
            this.websocketService.connect('http://localhost:8001');
            this.websocketService.getConnectionStatus().subscribe(function (isConnected) {
                _this.isConnected = isConnected;
                if (isConnected) {
                    _this.addMessage('Ciao! Sono il tuo assistente AI. Come posso aiutarti oggi?', false);
                }
                else {
                    _this.addMessage('Connessione persa. Tentativo di riconnessione...', false);
                }
            });
            this.websocketService.getMessages().subscribe(function (messageData) { return __awaiter(_this, void 0, void 0, function () {
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            this.isTyping = false;
                            if (!messageData.message) return [3 /*break*/, 2];
                            // System message
                            return [4 /*yield*/, this.addMessage(messageData.message, false)];
                        case 1:
                            // System message
                            _a.sent();
                            return [3 /*break*/, 6];
                        case 2:
                            if (!messageData.response) return [3 /*break*/, 4];
                            // Agent response
                            return [4 /*yield*/, this.addMessage(messageData.response, false)];
                        case 3:
                            // Agent response
                            _a.sent();
                            return [3 /*break*/, 6];
                        case 4:
                            if (!messageData.error) return [3 /*break*/, 6];
                            // Error message
                            return [4 /*yield*/, this.addMessage("\u274C Errore: ".concat(messageData.error), false)];
                        case 5:
                            // Error message
                            _a.sent();
                            _a.label = 6;
                        case 6: return [2 /*return*/];
                    }
                });
            }); });
        };
        ChatComponent_1.prototype.ngAfterViewChecked = function () {
            this.scrollToBottom();
        };
        ChatComponent_1.prototype.addMessage = function (content, isUser) {
            return __awaiter(this, void 0, void 0, function () {
                var message, htmlContent, error_1;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            message = {
                                content: content,
                                isUser: isUser,
                                timestamp: new Date()
                            };
                            if (!!isUser) return [3 /*break*/, 4];
                            _a.label = 1;
                        case 1:
                            _a.trys.push([1, 3, , 4]);
                            return [4 /*yield*/, (0, marked_1.marked)(content)];
                        case 2:
                            htmlContent = _a.sent();
                            message.htmlContent = this.sanitizer.bypassSecurityTrustHtml(htmlContent);
                            return [3 /*break*/, 4];
                        case 3:
                            error_1 = _a.sent();
                            console.error('Errore nel parsing markdown:', error_1);
                            message.htmlContent = this.sanitizer.bypassSecurityTrustHtml(content);
                            return [3 /*break*/, 4];
                        case 4:
                            this.messages.push(message);
                            return [2 /*return*/];
                    }
                });
            });
        };
        ChatComponent_1.prototype.sendMessage = function () {
            if (this.newMessage.trim() !== '' && this.isConnected) {
                this.addMessage(this.newMessage, true);
                this.websocketService.sendMessage(this.newMessage);
                this.newMessage = '';
                this.isTyping = true;
            }
        };
        ChatComponent_1.prototype.onKeyPress = function (event) {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                this.sendMessage();
            }
        };
        ChatComponent_1.prototype.scrollToBottom = function () {
            try {
                if (this.messagesContainer) {
                    this.messagesContainer.nativeElement.scrollTop =
                        this.messagesContainer.nativeElement.scrollHeight;
                }
            }
            catch (err) { }
        };
        ChatComponent_1.prototype.formatTime = function (timestamp) {
            return timestamp.toLocaleTimeString('it-IT', {
                hour: '2-digit',
                minute: '2-digit'
            });
        };
        return ChatComponent_1;
    }());
    __setFunctionName(_classThis, "ChatComponent");
    (function () {
        var _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        _messagesContainer_decorators = [(0, core_1.ViewChild)('messagesContainer')];
        __esDecorate(null, null, _messagesContainer_decorators, { kind: "field", name: "messagesContainer", static: false, private: false, access: { has: function (obj) { return "messagesContainer" in obj; }, get: function (obj) { return obj.messagesContainer; }, set: function (obj, value) { obj.messagesContainer = value; } }, metadata: _metadata }, _messagesContainer_initializers, _messagesContainer_extraInitializers);
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        ChatComponent = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return ChatComponent = _classThis;
}();
exports.ChatComponent = ChatComponent;
