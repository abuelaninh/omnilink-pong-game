# OmniLink Pac-Man + Advanced BFS Agent 🎮

A custom Python/Pygame implementation of Pac-Man, playable both by humans and an autonomous TypeScript agent. The backend communicates via a local HTTP server and an MQTT broker, allowing the agent to continuously request game state updates and issue movement commands in real time.

This project was built to balance classic arcade mechanics with AI pathfinding experimentation. The more advanced you make your agent, the farther it can run.

---

## 🏗️ Project Architecture

* **`pacman.py` (The Engine):** A completely standalone Python clone of Pac-Man. It handles all core game mechanics including ghost AI modes (Scatter/Chase/Frightened), pellets, high scores, tunnel wrapping, and rendering. By default, it operates with its own internal AI *disabled* so the agent can take control.
* **`server_wrapper.py` (The Bridge):** Wraps `pacman.py` turning it into a server. 
    * Runs an HTTP REST API on port `5000`. 
    * Exposes a `GET /data` endpoint for the agent to receive a continuous stream of the live game state.
    * Exposes a `POST /callback` endpoint for the agent to send its next movement command.
    * Uses **MQTT** to publish game context data (Score, Lives, etc.) and subscribes to `olink/commands` to listen for global pause/resume events.
* **`agent.ts` (Standard Agent):** A TypeScript agent utilizing a Breadth-First Search (BFS) pathfinding algorithm. It looks at the actual maze walls and tunnels to calculate absolute distances, and operates on a strict priority system for deciding its next move (Fleeing from ghosts > Chasing vulnerable ghosts > Hunting pellets). 
* **`advanced_agent.ts` (Advanced Agent):** A hyper-optimized version of `agent.ts`. It polls the game state significantly faster (`15ms` vs `60ms`) and has an expanded danger-detection radius (`10` tiles vs `6` tiles). This agent is built to survive the harder levels of the game when more ghosts are spawned and moving quickly.

---

## 📈 Difficulty Scaling

Unlike a static game loop, this project introduces a dynamic difficulty curve to challenge the AI:

### Lives:
Pac-Man starts the game with **`7`** lives. 

### Ghost Spawning:
As the agent progresses through the levels, more ghosts enter the maze:
* **Level 1:** Only 🔴 **Blinky** patrols the maze.
* **Level 2:** 🌸 **Pinky** joins the hunt.
* **Level 3:** 🔵 **Inky** is released.
* **Level 4+:** 🟠 **Clyde** completes the quartet.

### Frightened Duration Decay:
When Pac-Man eats a power pellet, the ghosts turn blue and can be eaten. The duration of this "Frightened" state decays over time:
* **Level 1:** 20.0 seconds
* **Level 2:** 17.5 seconds
* **Level 3:** 15.0 seconds
* **...**
* **Level 7+:** Caps at a minimum of `3.0` seconds.

### Speed Modifiers
The ghosts receive passive speed boosts every level, requiring the agent to make rapid, calculating decisions or risk getting cornered easily.

---

## 🧠 How the AI Thinks

Both `agent.ts` and `advanced_agent.ts` use Breadth-First Search to map the entire board and score every potential movement direction. Their core priority loop is:

1. **Flee Mode (Highest Priority):** If an active ghost comes within the `FLEE_RADIUS` (6 tiles for the standard agent, 10 for the advanced agent), Pac-Man enters absolute survival mode. It will aggressively path-find the exact direction that maximizes its distance from the closest ghost in the subsequent frames. 
2. **Chase Mode (Medium Priority):** If no ghosts are dangerously close, but Pac-Man has recently eaten a Power Pellet, the AI will reverse gears. It scans for the closest *frightened* ghost and calculates the shortest path to eat them to farm bonus points.
3. **Hunt Mode (Lowest Priority):** When no threats are nearby and no ghosts are frightened, Pac-Man relaxes and sweeps the map. It finds the shortest BFS path to the closest pellet and eats it. If a ghost gets somewhat near (within 12 tiles), Pac-Man will actively favor routing toward *Power Pellets* over normal pellets.

---

## 🚀 Running the Project

### Prerequisites
* **Python 3.x**
* **Node.js** and `npx` (to run the TypeScript agent)
* **MQTT Broker** (Optional, but recommended for the full pause/resume features. e.g., Mosquitto running on `localhost:1883`)

### 1. Start the Game Server
In your first terminal window, launch the Python server:
```bash
python server_wrapper.py
```
*Note: A Pygame window will open showing the maze. The game will sit idle awaiting commands.*

### 2. Connect the Agent
In a second terminal window, connect the agent of your choice:

**To run the standard agent:**
```bash
npx ts-node agent.ts
```

**To run the advanced agent:**
```bash
npx ts-node advanced_agent.ts
```

Watch the agent play! You can monitor the terminal logs of the agent to see exactly *why* it is making the decisions it makes frame-by-frame.
