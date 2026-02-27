# QuantEdge — Portfolio Intelligence

## 🚀 Run Locally

### 1. Install Node.js (if not installed)

Download from [nodejs.org](https://nodejs.org/) or via Homebrew:

```bash
brew install node
```

### 2. Install dependencies & start server

```bash
cd "/Users/carlink/Desktop/plateforme portfolio"
npm install
npm start
```

The app will be available at **<http://localhost:3000>**

---

## 🌐 Share with Others (Public URL)

### Option A — ngrok (instant, no account needed)

```bash
# In a second terminal:
npx ngrok http 3000
```

ngrok gives you a public HTTPS URL like `https://abc123.ngrok.io` — share this link with anyone.

### Option B — Netlify Drop (permanent, free)

1. Go to **[netlify.com/drop](https://app.netlify.com/drop)**
2. Drag & drop the entire `plateforme portfolio` folder
3. You get a permanent public URL instantly — no account required!

### Option C — GitHub Pages

1. Push the folder to a GitHub repo
2. Go to **Settings → Pages → Source: main branch**
3. Your app is live at `https://yourusername.github.io/repo-name`

---

## 📁 File Structure

| File | Description |
|------|-------------|
| `index.html` | Main app — structure + CSS |
| `app.js` | Core data, state, Yahoo Finance API |
| `app2.js` | Search, modals, portfolio table |
| `app3.js` | Charts, projections, export |
| `app4.js` | Dynamic comparison portfolios |
| `app5.js` | Live news feed |
| `app6.js` | Interactive financial ratios |
| `server.js` | Express static server |
