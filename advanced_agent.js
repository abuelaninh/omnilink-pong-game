/**
 * OmniLink Pac-Man Agent  –  BFS Pathfinding Edition
 * ─────────────────────────────────────────────────────────────
 * Target : Browser / OmniLink Tool environment (ESM / isolated Worker)
 *
 * Core improvement over previous version:
 *   Uses real BFS on the actual maze walkable map received from the server.
 *   Manhattan-distance heuristics are gone – every decision is based on
 *   actual reachable tile distances respecting walls and tunnels.
 *
 * Strategy:
 *   FLEE  – ghost within FLEE_RADIUS tiles (BFS dist) → run toward the
 *            tile that maximises BFS distance from the ghost.
 *   CHASE – a ghost is FRIGHTENED → BFS toward it to eat it.
 *   HUNT  – eat the closest reachable pellet / power-pellet (BFS).
 *
 * Communication:
 *   GET  http://localhost:5000/data       ← game state + walkable map
 *   POST http://localhost:5000/callback   → chosen direction
 *   MQTT ws://localhost:9001  olink/commands  ← pause/resume
 */
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
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
// ── Logging flags ─────────────────────────────────────────────────────────────
var LOG_MOVE = true;
var LOG_DANGER = false;
var LOG_IDLE = false;
var LOG_MQTT = true;
var LOG_ERRORS = true;
// ── Config ────────────────────────────────────────────────────────────────────
var API_URL = "http://localhost:5000";
var POLL_DELAY_MS = 15;
var MQTT_WS_URL = "ws://localhost:9001";
var CMD_TOPIC = "olink/commands";
var FLEE_RADIUS = 10; // BFS tiles – enter FLEE mode when ghost is this close
var OPPOSITE = {
    LEFT: "RIGHT", RIGHT: "LEFT", UP: "DOWN", DOWN: "UP",
};
var DIR_VEC = {
    LEFT: [-1, 0],
    RIGHT: [1, 0],
    UP: [0, -1],
    DOWN: [0, 1],
};
var ALL_DIRS = ["LEFT", "RIGHT", "UP", "DOWN"];
// ── Shared agent state ────────────────────────────────────────────────────────
var lastVersion = -1;
var totalMoves = 0;
var lastScore = 0;
var lastLives = 3;
var lastLevel = 1;
var committedDir = null;
var commitLeft = 0;
var COMMIT_FRAMES = 5;
// ── Maze helpers ──────────────────────────────────────────────────────────────
/** Return true if tile (x,y) is walkable, honoring tunnel wrap. */
function isWalkable(x, y, state) {
    var _a;
    var W = state.grid_width, H = state.grid_height, walkable = state.walkable, tunnel_rows = state.tunnel_rows;
    if (y < 0 || y >= H)
        return false;
    // Horizontal wrap for tunnel rows
    if (x < 0 || x >= W) {
        if (!tunnel_rows.includes(y))
            return false;
        x = ((x % W) + W) % W;
    }
    return ((_a = walkable[y]) === null || _a === void 0 ? void 0 : _a[x]) === "1";
}
/** Wrap an x-coordinate in a tunnel row, or return it unchanged. */
function wrapX(x, y, state) {
    var W = state.grid_width, tunnel_rows = state.tunnel_rows;
    if (tunnel_rows.includes(y))
        return ((x % W) + W) % W;
    return x;
}
/**
 * BFS from (sx, sy).
 * Returns a Map<"x,y", distance> for all reachable tiles.
 * Optionally stops early once `stopAt` set is fully found.
 */
function bfsDistances(sx, sy, state, stopAt) {
    var dist = new Map();
    var queue = [[sx, sy]];
    dist.set("".concat(sx, ",").concat(sy), 0);
    var found = 0;
    var needed = stopAt ? stopAt.size : Infinity;
    while (queue.length > 0) {
        if (found >= needed)
            break;
        var _a = queue.shift(), x = _a[0], y = _a[1];
        var d = dist.get("".concat(x, ",").concat(y));
        for (var _i = 0, ALL_DIRS_1 = ALL_DIRS; _i < ALL_DIRS_1.length; _i++) {
            var dir = ALL_DIRS_1[_i];
            var _b = DIR_VEC[dir], dvx = _b[0], dvy = _b[1];
            var nx = x + dvx, ny = y + dvy;
            nx = wrapX(nx, ny, state);
            if (!isWalkable(nx, ny, state))
                continue;
            var key = "".concat(nx, ",").concat(ny);
            if (dist.has(key))
                continue;
            dist.set(key, d + 1);
            if (stopAt === null || stopAt === void 0 ? void 0 : stopAt.has(key))
                found++;
            queue.push([nx, ny]);
        }
    }
    return dist;
}
/**
 * Return the first-step direction toward `goal` from `start` using BFS.
 * Returns null if goal is unreachable.
 */
function bfsFirstStep(sx, sy, gx, gy, state, forbidReverse) {
    if (sx === gx && sy === gy)
        return null;
    var prev = new Map();
    var dirOf = new Map();
    var queue = [[sx, sy]];
    var startKey = "".concat(sx, ",").concat(sy);
    var goalKey = "".concat(gx, ",").concat(gy);
    prev.set(startKey, null);
    while (queue.length > 0) {
        var _a = queue.shift(), x = _a[0], y = _a[1];
        if ("".concat(x, ",").concat(y) === goalKey)
            break;
        for (var _i = 0, ALL_DIRS_2 = ALL_DIRS; _i < ALL_DIRS_2.length; _i++) {
            var dir = ALL_DIRS_2[_i];
            var _b = DIR_VEC[dir], dvx = _b[0], dvy = _b[1];
            var nx = x + dvx, ny = y + dvy;
            nx = wrapX(nx, ny, state);
            if (!isWalkable(nx, ny, state))
                continue;
            var key = "".concat(nx, ",").concat(ny);
            if (prev.has(key))
                continue;
            // Don't allow going backwards from start
            if ("".concat(x, ",").concat(y) === startKey && forbidReverse && dir === forbidReverse)
                continue;
            prev.set(key, [x, y]);
            dirOf.set(key, dir);
            queue.push([nx, ny]);
        }
    }
    if (!prev.has(goalKey))
        return null;
    // Trace back to find the first step from start
    var cur = goalKey;
    while (true) {
        var p = prev.get(cur);
        if (p === null)
            return null; // shouldn't happen
        var pk = "".concat(p[0], ",").concat(p[1]);
        if (pk === startKey)
            return dirOf.get(cur);
        cur = pk;
    }
}
// ── Main decision function ────────────────────────────────────────────────────
function chooseMove(state) {
    var _a, _b, _c, _d;
    var px = Math.floor(state.player.x);
    var py = Math.floor(state.player.y);
    var currentDir = state.player.dir;
    var forbidReverse = OPPOSITE[currentDir];
    // ── Direction commitment: keep going straight unless forced to reconsider ─
    if (committedDir !== null && commitLeft > 0) {
        var _e = DIR_VEC[committedDir], vx = _e[0], vy = _e[1];
        var nx = wrapX(px + vx, py + vy, state);
        var ny = py + vy;
        if (isWalkable(nx, ny, state)) {
            commitLeft--;
            return committedDir;
        }
        // Wall ahead – reconsider now
        commitLeft = 0;
        committedDir = null;
    }
    // ── Compute BFS distances from player ─────────────────────────────────────
    var fromPlayer = bfsDistances(px, py, state);
    // ── Check ghost threats ───────────────────────────────────────────────────
    var activeGhosts = state.ghosts.filter(function (g) { return g.state !== "FRIGHTENED" && g.state !== "EATEN"; });
    var frightenedGhosts = state.ghosts.filter(function (g) { return g.state === "FRIGHTENED"; });
    var closestThreatDist = Infinity;
    var closestThreat = null;
    for (var _i = 0, activeGhosts_1 = activeGhosts; _i < activeGhosts_1.length; _i++) {
        var g = activeGhosts_1[_i];
        var d = (_a = fromPlayer.get("".concat(Math.floor(g.x), ",").concat(Math.floor(g.y)))) !== null && _a !== void 0 ? _a : Infinity;
        if (d < closestThreatDist) {
            closestThreatDist = d;
            closestThreat = g;
        }
    }
    var mode = "HUNT";
    if (closestThreatDist <= FLEE_RADIUS)
        mode = "FLEE";
    else if (frightenedGhosts.length > 0)
        mode = "CHASE";
    // ── FLEE: pick direction that maximises min-ghost BFS distance ────────────
    if (mode === "FLEE") {
        if (LOG_MOVE)
            console.log("[AI] \uD83D\uDEA8 FLEE \u2013 ghost ".concat(closestThreat === null || closestThreat === void 0 ? void 0 : closestThreat.name, " dist=").concat(closestThreatDist));
        var bestDir = null;
        var bestScore = -Infinity;
        var _loop_1 = function (dir) {
            if (dir === forbidReverse)
                return "continue"; // avoid reversing unless forced
            var _s = DIR_VEC[dir], vx = _s[0], vy = _s[1];
            var nx = wrapX(px + vx, py + vy, state);
            var ny = py + vy;
            if (!isWalkable(nx, ny, state))
                return "continue";
            // BFS from this next tile to evaluate safety
            var fromNext = bfsDistances(nx, ny, state);
            var minGhostDist = Infinity;
            for (var _t = 0, activeGhosts_2 = activeGhosts; _t < activeGhosts_2.length; _t++) {
                var g = activeGhosts_2[_t];
                var d = (_b = fromNext.get("".concat(Math.floor(g.x), ",").concat(Math.floor(g.y)))) !== null && _b !== void 0 ? _b : Infinity;
                if (d < minGhostDist)
                    minGhostDist = d;
            }
            // Tiebreak: prefer directions that also have pellets nearby
            var pelletBonus = state.pellets.some(function (_a) {
                var _b;
                var tx = _a[0], ty = _a[1];
                return ((_b = fromNext.get("".concat(tx, ",").concat(ty))) !== null && _b !== void 0 ? _b : Infinity) <= 3;
            }) ? 0.5 : 0;
            var score = minGhostDist + pelletBonus;
            if (LOG_DANGER)
                console.log("  [FLEE] ".concat(dir, " \u2192 ghostDist=").concat(minGhostDist.toFixed(0), " bonus=").concat(pelletBonus));
            if (score > bestScore) {
                bestScore = score;
                bestDir = dir;
            }
        };
        for (var _f = 0, ALL_DIRS_3 = ALL_DIRS; _f < ALL_DIRS_3.length; _f++) {
            var dir = ALL_DIRS_3[_f];
            _loop_1(dir);
        }
        // If all non-reverse dirs are walls, allow reverse
        if (bestDir === null) {
            for (var _h = 0, ALL_DIRS_4 = ALL_DIRS; _h < ALL_DIRS_4.length; _h++) {
                var dir = ALL_DIRS_4[_h];
                var _j = DIR_VEC[dir], vx = _j[0], vy = _j[1];
                if (isWalkable(wrapX(px + vx, py + vy, state), py + vy, state)) {
                    bestDir = dir;
                    break;
                }
            }
        }
        var chosen = bestDir !== null && bestDir !== void 0 ? bestDir : currentDir;
        committedDir = chosen;
        commitLeft = 2; // short commitment during flee
        return chosen;
    }
    // ── CHASE: BFS toward nearest frightened ghost ────────────────────────────
    if (mode === "CHASE") {
        var bestDir = null;
        var minDist = Infinity;
        for (var _k = 0, frightenedGhosts_1 = frightenedGhosts; _k < frightenedGhosts_1.length; _k++) {
            var g = frightenedGhosts_1[_k];
            var gx = Math.floor(g.x), gy = Math.floor(g.y);
            var d = (_c = fromPlayer.get("".concat(gx, ",").concat(gy))) !== null && _c !== void 0 ? _c : Infinity;
            if (d < minDist) {
                var dir = bfsFirstStep(px, py, gx, gy, state, forbidReverse);
                if (dir) {
                    minDist = d;
                    bestDir = dir;
                }
            }
        }
        if (bestDir) {
            if (LOG_MOVE)
                console.log("[AI] \uD83D\uDC7B CHASE frightened ghost \u2192 ".concat(bestDir, "  dist=").concat(minDist));
            committedDir = bestDir;
            commitLeft = COMMIT_FRAMES;
            return bestDir;
        }
        // Fall through to HUNT if BFS failed
    }
    // ── HUNT: BFS toward closest reachable pellet ─────────────────────────────
    // Prefer power pellets if a ghost is even remotely near (within 12 tiles)
    var wantPower = closestThreatDist <= 12;
    var targetList = wantPower
        ? __spreadArray(__spreadArray([], state.power_pellets, true), state.pellets, true) : __spreadArray(__spreadArray([], state.pellets, true), state.power_pellets, true);
    var bestHuntDir = null;
    var bestHuntDist = Infinity;
    for (var _l = 0, targetList_1 = targetList; _l < targetList_1.length; _l++) {
        var _m = targetList_1[_l], tx = _m[0], ty = _m[1];
        var d = (_d = fromPlayer.get("".concat(tx, ",").concat(ty))) !== null && _d !== void 0 ? _d : Infinity;
        if (d < bestHuntDist) {
            var dir = bfsFirstStep(px, py, tx, ty, state, forbidReverse);
            if (dir) {
                bestHuntDist = d;
                bestHuntDir = dir;
            }
        }
    }
    // If all pellets are blocked by reverse only, try with reverse allowed
    if (!bestHuntDir) {
        for (var _o = 0, targetList_2 = targetList; _o < targetList_2.length; _o++) {
            var _p = targetList_2[_o], tx = _p[0], ty = _p[1];
            var dir = bfsFirstStep(px, py, tx, ty, state);
            if (dir) {
                bestHuntDir = dir;
                break;
            }
        }
    }
    if (bestHuntDir) {
        if (LOG_MOVE)
            console.log("[AI] \uD83D\uDD35 HUNT pellet @ dist=".concat(bestHuntDist, " \u2192 ").concat(bestHuntDir, "  (pellets_left=").concat(state.pellets_left, ")"));
        committedDir = bestHuntDir;
        commitLeft = COMMIT_FRAMES;
        return bestHuntDir;
    }
    // Absolute fallback: keep going, or try any walkable direction
    if (LOG_MOVE)
        console.log("[AI] ⚠️  No target found – continuing current direction");
    for (var _q = 0, ALL_DIRS_5 = ALL_DIRS; _q < ALL_DIRS_5.length; _q++) {
        var dir = ALL_DIRS_5[_q];
        var _r = DIR_VEC[dir], vx = _r[0], vy = _r[1];
        if (isWalkable(wrapX(px + vx, py + vy, state), py + vy, state))
            return dir;
    }
    return currentDir;
}
// ── Main agent loop ───────────────────────────────────────────────────────────
function agentLoop() {
    return __awaiter(this, void 0, void 0, function () {
        var res, wrapper, state, move, action, err_1, msg;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 6, , 7]);
                    return [4 /*yield*/, fetch("".concat(API_URL, "/data"))];
                case 1:
                    res = _a.sent();
                    if (!res.ok)
                        throw new Error("HTTP ".concat(res.status));
                    return [4 /*yield*/, res.json()];
                case 2:
                    wrapper = _a.sent();
                    if (!(wrapper.command === "ACTIVATE" && wrapper.version > lastVersion)) return [3 /*break*/, 4];
                    lastVersion = wrapper.version;
                    state = JSON.parse(wrapper.payload);
                    // ── Game event logging ─────────────────────────────────────────────
                    if (state.score !== lastScore) {
                        console.log("[GAME] \uD83D\uDD36 Score: ".concat(lastScore, " \u2192 ").concat(state.score, " (+").concat(state.score - lastScore, ")"));
                        lastScore = state.score;
                    }
                    if (state.lives !== lastLives) {
                        console.log("[GAME] \uD83D\uDC94 Lives: ".concat(lastLives, " \u2192 ").concat(state.lives));
                        lastLives = state.lives;
                        // Reset commitment on death
                        committedDir = null;
                        commitLeft = 0;
                    }
                    if (state.level !== lastLevel) {
                        console.log("[GAME] \uD83C\uDF89 Level up! ".concat(lastLevel, " \u2192 ").concat(state.level));
                        lastLevel = state.level;
                        committedDir = null;
                        commitLeft = 0;
                    }
                    // ── No walkable map yet (first poll before level starts) ───────────
                    if (!state.walkable || state.walkable.length === 0)
                        return [2 /*return*/];
                    move = chooseMove(state);
                    totalMoves++;
                    action = {
                        action: move,
                        version: wrapper.version,
                        timestamp: new Date().toISOString(),
                    };
                    return [4 /*yield*/, fetch("".concat(API_URL, "/callback"), {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify(action),
                        })];
                case 3:
                    _a.sent();
                    return [3 /*break*/, 5];
                case 4:
                    if (wrapper.command === "IDLE") {
                        if (LOG_IDLE)
                            console.log("[AGENT] IDLE (v=".concat(wrapper.version, ")"));
                    }
                    _a.label = 5;
                case 5: return [3 /*break*/, 7];
                case 6:
                    err_1 = _a.sent();
                    if (LOG_ERRORS) {
                        msg = err_1 instanceof Error ? "".concat(err_1.name, ": ").concat(err_1.message) : String(err_1);
                        console.error("[AGENT] Error: ".concat(msg));
                    }
                    return [3 /*break*/, 7];
                case 7: return [2 /*return*/];
            }
        });
    });
}
// ── MQTT Pause/Resume (globalThis-safe for Workers) ──────────────────────────
var _g = globalThis;
function sendMqttCommand(cmd) {
    var client = _g["mqttClient"];
    if (!client) {
        console.warn("[MQTT] Client not ready.");
        return;
    }
    var payload = JSON.stringify({ command: cmd });
    client.publish(CMD_TOPIC, payload);
    if (LOG_MQTT)
        console.log("[MQTT] \u2192 '".concat(CMD_TOPIC, "': ").concat(payload));
}
_g["pauseGame"] = function () { return sendMqttCommand("pause"); };
_g["resumeGame"] = function () { return sendMqttCommand("resume"); };
function initMqtt() {
    return __awaiter(this, void 0, void 0, function () {
        var mqttLib, client_1;
        return __generator(this, function (_a) {
            try {
                mqttLib = _g["mqtt"];
                if (!mqttLib) {
                    console.warn("[MQTT] No global mqtt lib – pause/resume unavailable.");
                    return [2 /*return*/];
                }
                client_1 = mqttLib.connect(MQTT_WS_URL, { clientId: "pacman-bfs-".concat(Date.now()) });
                client_1.on("connect", function () {
                    if (LOG_MQTT)
                        console.log("[MQTT] \u2705 Connected to ".concat(MQTT_WS_URL));
                    _g["mqttClient"] = client_1;
                });
                client_1.on("error", function (e) { if (LOG_ERRORS)
                    console.error("[MQTT]", e.message); });
                client_1.on("close", function () { if (LOG_MQTT)
                    console.log("[MQTT] Disconnected."); });
            }
            catch (err) {
                if (LOG_ERRORS)
                    console.error("[MQTT] Init error:", err);
            }
            return [2 /*return*/];
        });
    });
}
// ── Bootstrap ─────────────────────────────────────────────────────────────────
console.log("╔═══════════════════════════════════════════════╗");
console.log("║  🎮  OmniLink Pac-Man Advanced Agent  –  BFS Edition   ║");
console.log("╚═══════════════════════════════════════════════╝");
console.log("[CONFIG] API      : ".concat(API_URL, "  (poll every ").concat(POLL_DELAY_MS, "ms)"));
console.log("[CONFIG] MQTT     : ".concat(MQTT_WS_URL, "  topic='").concat(CMD_TOPIC, "'"));
console.log("[CONFIG] Flee at  : ".concat(FLEE_RADIUS, " BFS tiles from ghost"));
console.log("[INFO]   globalThis.pauseGame() / resumeGame() available");
initMqtt();
function runLoop() {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, agentLoop()];
                case 1:
                    _a.sent();
                    setTimeout(runLoop, POLL_DELAY_MS);
                    return [2 /*return*/];
            }
        });
    });
}
runLoop();
