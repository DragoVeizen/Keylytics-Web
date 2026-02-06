# Keylytics Web

A Monkeytype-inspired typing practice application with keystroke analytics.

![Keylytics Screenshot](https://via.placeholder.com/800x400?text=Keylytics+Screenshot)

## Features

- **Multiple Themes**: Dark, Light, Ocean, Forest, Sunset
- **Real-time Stats**: Live WPM, accuracy, and time tracking
- **Analytics**: Detailed breakdown of typing performance
- **Charts**: WPM over time, per-key latency visualization
- **Insights**: AI-powered suggestions for improvement
- **Keyboard Shortcuts**: Tab for new text, Esc to restart

## Quick Start

### Local Development

```bash
# Clone the repo
git clone https://github.com/DragoVeizen/Keylytics-Web.git
cd Keylytics-Web

# Create virtual environment
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run the server
uvicorn app:app --reload

# Open http://localhost:8000
```

### Docker

```bash
docker build -t keylytics-web .
docker run -p 8000:8000 keylytics-web
```

## Deploy

### Railway

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new/template)

1. Click the button above
2. Connect your GitHub account
3. Select this repository
4. Deploy!

### Render

1. Create a new Web Service on [Render](https://render.com)
2. Connect your GitHub repository
3. Render will auto-detect the `render.yaml` configuration
4. Deploy!

### Vercel / Netlify

This is a Python backend app, so you'll need a platform that supports Python (Railway, Render, Fly.io, etc.)

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Main typing interface |
| `/api/text` | GET | Get random text to type |
| `/api/texts` | GET | Get all available texts |
| `/api/analyze` | POST | Analyze typing session |

## Themes

Switch themes using the theme dots in the header:

- **Dark** - Classic dark mode (default)
- **Light** - Clean light mode
- **Ocean** - Deep blue tones
- **Forest** - Natural green tones
- **Sunset** - Warm pink/purple tones

## Tech Stack

- **Backend**: FastAPI, Python
- **Frontend**: Vanilla JS, Chart.js
- **Analytics**: Custom keystroke analysis engine
- **Styling**: Pure CSS with CSS variables for theming

## License

MIT
