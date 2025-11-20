/// <cts-enable />
import { CellLike, type JSONSchema, NAME, recipe, UI } from "commontools";

type IFrameRecipe = {
  src: string;
  argumentSchema: JSONSchema;
  resultSchema: JSONSchema;
  spec: string;
  plan?: string;
  goal?: string;
  name: string;
};

const inst: IFrameRecipe = /* IFRAME-V0 */ {
  "src":
    '<html>\n<head>\n<meta name="template-version" content="1.0.0">\n<script src="https://cdn.tailwindcss.com"></script>\n<script type="importmap">\n{"imports":{"react":"https://esm.sh/react@18.3.0","react-dom":"https://esm.sh/react-dom@18.3.0","react-dom/client":"https://esm.sh/react-dom@18.3.0/client","@babel/standalone":"https://esm.sh/@babel/standalone@7.24.7"}}\n</script>\n<!-- Bootstrap script that runs first to set up React and utility functions -->\n<script type="module" id="bootstrap" src="/static/scripts/iframe-bootstrap.js"></script>\n\n<!-- User code to be transformed by Babel -->\n<script type="text/babel" data-presets="react" id="user-code">\n// BEGIN_USER_CODE\n\nfunction onLoad() {\n  return []; // No additional libraries needed\n}\n\nconst title = \'Catch the Square\';\n\nfunction CatchTheSquare() {\n  // Get reactive state from the schema\n  const [score, setScore] = useReactiveCell(["score"]);\n  const [speed, setSpeed] = useReactiveCell(["speed"]);\n  \n  // Local state for square position\n  const [position, setPosition] = React.useState({ x: 50, y: 50 });\n  \n  // Generate random position (percentage based)\n  const getRandomPosition = () => {\n    // Keep square away from edges (leave 100px margin)\n    const margin = 10; // percentage\n    return {\n      x: margin + Math.random() * (90 - margin * 2),\n      y: margin + Math.random() * (90 - margin * 2)\n    };\n  };\n  \n  // Initialize position on mount\n  React.useEffect(() => {\n    setPosition(getRandomPosition());\n  }, []);\n  \n  // Auto-move square based on speed (if speed > 0)\n  React.useEffect(() => {\n    if (speed > 0) {\n      const interval = setInterval(() => {\n        setPosition(getRandomPosition());\n      }, speed);\n      return () => clearInterval(interval);\n    }\n  }, [speed]);\n  \n  // Handle catching the square\n  const handleCatch = () => {\n    setScore(score + 1);\n    setPosition(getRandomPosition());\n  };\n  \n  return (\n    <div className="relative w-full h-screen bg-gradient-to-br from-blue-50 to-purple-50 overflow-hidden">\n      {/* Score display */}\n      <div className="absolute top-8 left-1/2 transform -translate-x-1/2 z-10">\n        <div className="bg-white rounded-lg shadow-lg px-8 py-4">\n          <div className="text-gray-500 text-sm font-medium">SCORE</div>\n          <div className="text-5xl font-bold text-purple-600">{score}</div>\n        </div>\n      </div>\n      \n      {/* Instructions */}\n      <div className="absolute top-8 left-8 bg-white rounded-lg shadow-md px-4 py-3 max-w-xs">\n        <p className="text-sm text-gray-700">\n          <span className="font-bold">Click the square</span> to catch it!\n        </p>\n      </div>\n      \n      {/* Speed control */}\n      <div className="absolute top-8 right-8 bg-white rounded-lg shadow-md px-4 py-3">\n        <label className="text-sm font-medium text-gray-700 block mb-2">\n          Auto-move speed: {speed === 0 ? "Off" : `${speed}ms`}\n        </label>\n        <input\n          type="range"\n          min="0"\n          max="3000"\n          step="100"\n          value={speed}\n          onChange={(e) => setSpeed(parseInt(e.target.value))}\n          className="w-48"\n        />\n      </div>\n      \n      {/* The catchable square */}\n      <div\n        onClick={handleCatch}\n        style={{\n          position: \'absolute\',\n          left: `${position.x}%`,\n          top: `${position.y}%`,\n          transform: \'translate(-50%, -50%)\',\n          transition: \'all 0.3s ease-out\'\n        }}\n        className="w-20 h-20 bg-gradient-to-br from-pink-400 to-purple-500 rounded-lg shadow-lg cursor-pointer hover:scale-110 active:scale-95 transition-transform"\n      >\n        <div className="w-full h-full flex items-center justify-center text-white text-2xl font-bold">\n          ?\n        </div>\n      </div>\n    </div>\n  );\n}\n\nfunction onReady(mount, sourceData) {\n  function App() {\n    return <CatchTheSquare />;\n  }\n\n  const root = ReactDOM.createRoot(mount);\n  root.render(<App />);\n}\n// END_USER_CODE\n\n// Export the functions so we can access them after Babel transformation\nwindow.__app = { onLoad, onReady, title };\n</script>\n</head>\n  <body class="bg-gray-50"></body>\n</html>',
  "spec":
    "A simple game where a colored square appears at random positions on the screen. The player clicks the square to 'catch' it, which increments their score and moves the square to a new random position. The game includes a speed control slider that can make the square automatically move at set intervals.",
  "plan":
    "1. Create a square element that can be positioned anywhere on screen\n2. Implement click handler that increments score and repositions square\n3. Add random position generator\n4. Add score display\n5. Add optional auto-move feature with speed control\n6. Style with gradients and animations for visual appeal",
  "goal": "Test iframe functionality with a simple interactive game",
  "argumentSchema": {
    "type": "object",
    "properties": {
      "score": {
        "type": "integer",
        "title": "Score",
        "description": "Number of times the square has been caught",
        "default": 0,
      },
      "speed": {
        "type": "integer",
        "title": "Auto-move Speed (ms)",
        "description": "Milliseconds between automatic moves (0 = disabled)",
        "default": 0,
        "minimum": 0,
        "maximum": 5000,
      },
    },
    "title": "Catch the Square Game",
    "description":
      "A simple game to test iframe functionality - click the square to score points!",
  },
  "resultSchema": {
    "type": "object",
    "title": "Catch the Square Game",
    "description":
      "Interactive game testing iframe click handling and reactive state",
    "properties": {
      "score": {
        "type": "integer",
        "title": "Score",
        "description": "Number of times the square has been caught",
        "default": 0,
      },
      "speed": {
        "type": "integer",
        "title": "Auto-move Speed (ms)",
        "description": "Milliseconds between automatic moves (0 = disabled)",
        "default": 0,
        "minimum": 0,
        "maximum": 5000,
      },
    },
    "required": [
      "score",
      "speed",
    ],
  },
  "name": "Catch the Square",
}; /* IFRAME-V0 */

const runIframeRecipe = (
  { argumentSchema, resultSchema, src, name }: IFrameRecipe,
) =>
  recipe(argumentSchema, resultSchema, (data) => ({
    [NAME]: name,
    [UI]: <ct-iframe src={src} $context={data as CellLike<any>}></ct-iframe>,
    score: data.score,
    speed: data.speed,
  }));

export default runIframeRecipe(inst);
