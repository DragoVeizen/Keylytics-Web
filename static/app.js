// Keylytics - Typing Practice Application

class KeylyticsApp {
    constructor() {
        // DOM Elements
        this.textDisplay = document.getElementById('text-display');
        this.typingInput = document.getElementById('typing-input');
        this.typingArea = document.getElementById('typing-area');
        this.resultsPanel = document.getElementById('results-panel');
        this.restartBtn = document.getElementById('restart-btn');
        this.progressFill = document.getElementById('progress-fill');

        // Live stats
        this.liveWpm = document.getElementById('live-wpm');
        this.liveAccuracy = document.getElementById('live-accuracy');
        this.timerDisplay = document.getElementById('timer-display');
        this.liveProgress = document.getElementById('live-progress');
        this.timerContainer = document.getElementById('timer-container');
        this.progressContainer = document.getElementById('progress-container');

        // Mode controls
        this.modeButtons = document.querySelectorAll('.mode-btn');
        this.wordCountButtons = document.querySelectorAll('.word-count-btn');
        this.timeButtons = document.querySelectorAll('.time-btn');

        // State
        this.targetText = '';
        this.typedText = '';
        this.events = [];
        this.startTime = null;
        this.isComplete = false;

        // Mode state
        this.mode = 'words'; // 'words', 'time', or 'quote'
        this.wordCount = 30;
        this.timeLimit = 30;
        this.timerInterval = null;
        this.remainingTime = 0;

        // WPM tracking for graph
        this.wpmSamples = [];
        this.wpmSampleInterval = null;

        // Charts
        this.wpmChart = null;

        // Initialize
        this.init();
    }

    async init() {
        await this.loadNewText();
        this.attachEventListeners();
        this.loadTheme();
        this.typingInput.focus();
    }

    attachEventListeners() {
        // Typing events
        this.typingInput.addEventListener('keydown', (e) => this.handleKeyDown(e));
        this.typingInput.addEventListener('keyup', (e) => this.handleKeyUp(e));
        this.typingInput.addEventListener('input', (e) => this.handleInput(e));

        // Restart button
        this.restartBtn.addEventListener('click', () => this.restart());

        // Global shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Tab' && !this.isComplete) {
                e.preventDefault();
                this.loadNewText();
            }
            if (e.key === 'Escape') {
                e.preventDefault();
                this.restart();
            }
        });

        // Theme selector
        document.querySelectorAll('.theme-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const theme = btn.dataset.theme;
                this.setTheme(theme);
            });
        });

        // Mode selector
        this.modeButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                this.modeButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.mode = btn.dataset.mode;
                this.updateModeVisibility();
                this.loadNewText();
            });
        });

        // Word count buttons
        this.wordCountButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                this.wordCountButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.wordCount = parseInt(btn.dataset.words);
                this.loadNewText();
            });
        });

        // Time buttons
        this.timeButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                this.timeButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.timeLimit = parseInt(btn.dataset.time);
                this.loadNewText();
            });
        });

        // Focus on click
        this.typingArea.addEventListener('click', () => {
            this.typingInput.focus();
        });
    }

    updateModeVisibility() {
        const wordOptions = document.getElementById('word-options');
        const timeOptions = document.getElementById('time-options');

        if (this.mode === 'words') {
            wordOptions.classList.remove('hidden');
            timeOptions.classList.add('hidden');
            this.timerContainer.classList.add('hidden');
            this.progressContainer.classList.remove('hidden');
        } else if (this.mode === 'time') {
            wordOptions.classList.add('hidden');
            timeOptions.classList.remove('hidden');
            this.timerContainer.classList.remove('hidden');
            this.progressContainer.classList.remove('hidden');
        } else {
            // quote mode
            wordOptions.classList.add('hidden');
            timeOptions.classList.add('hidden');
            this.timerContainer.classList.add('hidden');
            this.progressContainer.classList.remove('hidden');
        }
    }

    // Theme Management
    loadTheme() {
        const saved = localStorage.getItem('keylytics-theme') || 'dark';
        this.setTheme(saved);
    }

    setTheme(theme) {
        document.body.dataset.theme = theme;
        localStorage.setItem('keylytics-theme', theme);
    }

    // Text Management
    async loadNewText() {
        try {
            let url;
            if (this.mode === 'quote') {
                url = '/api/text?mode=quote';
            } else {
                const wordCount = this.mode === 'time' ? 100 : this.wordCount;
                url = `/api/text?words=${wordCount}`;
            }
            const response = await fetch(url);
            const data = await response.json();
            this.targetText = data.text;
        } catch (error) {
            console.error('Failed to load text:', error);
            this.targetText = 'The quick brown fox jumps over the lazy dog.';
        }
        this.reset();
        this.renderText();
        this.updateModeVisibility();
    }

    reset() {
        this.typedText = '';
        this.events = [];
        this.startTime = null;
        this.isComplete = false;
        this.typingInput.value = '';
        this.typingInput.disabled = false;
        this.wpmSamples = [];

        // Clear intervals
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
        if (this.wpmSampleInterval) {
            clearInterval(this.wpmSampleInterval);
            this.wpmSampleInterval = null;
        }

        this.remainingTime = this.timeLimit;
        this.liveWpm.textContent = '0';
        this.liveAccuracy.textContent = '100';
        this.timerDisplay.textContent = this.timeLimit;
        this.progressFill.style.width = '0%';
        this.updateProgress();
    }

    restart() {
        // Show mode options again
        document.querySelector('.header-right').classList.remove('hidden');

        this.typingArea.classList.remove('hidden');
        this.resultsPanel.classList.add('hidden');

        // Auto-shuffle: load new text
        this.loadNewText();
    }

    renderText() {
        this.textDisplay.innerHTML = this.targetText
            .split('')
            .map((char, i) => {
                let className = 'char pending';
                if (i < this.typedText.length) {
                    className = this.typedText[i] === char ? 'char correct' : 'char incorrect';
                } else if (i === this.typedText.length) {
                    className = 'char current';
                }
                const displayChar = char === ' ' ? '&nbsp;' : this.escapeHtml(char);
                return `<span class="${className}">${displayChar}</span>`;
            })
            .join('');

        // Update progress bar
        const progress = (this.typedText.length / this.targetText.length) * 100;
        this.progressFill.style.width = `${Math.min(progress, 100)}%`;
        this.updateProgress();
    }

    updateProgress() {
        if (this.mode === 'time') {
            const wordCount = this.typedText.split(' ').filter(w => w).length;
            this.liveProgress.textContent = `${wordCount} words`;
        } else {
            this.liveProgress.textContent = `${this.typedText.length}/${this.targetText.length}`;
        }
    }

    escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // Event Handlers
    handleKeyDown(e) {
        if (this.isComplete) return;

        // Start timer on first keydown
        if (!this.startTime) {
            this.startTime = performance.now();

            // Start WPM sampling every 500ms
            this.wpmSampleInterval = setInterval(() => {
                this.sampleWpm();
            }, 500);

            // Start countdown for timed mode
            if (this.mode === 'time') {
                this.remainingTime = this.timeLimit;
                this.timerInterval = setInterval(() => {
                    this.remainingTime--;
                    this.timerDisplay.textContent = this.remainingTime;

                    if (this.remainingTime <= 0) {
                        this.complete();
                    }
                }, 1000);
            }
        }

        // Record event
        this.events.push({
            key: e.key,
            kind: 'keydown',
            t: performance.now()
        });
    }

    sampleWpm() {
        if (!this.startTime || this.isComplete) return;

        const elapsed = (performance.now() - this.startTime) / 1000; // seconds

        // Count correct characters
        let correctChars = 0;
        for (let i = 0; i < this.typedText.length; i++) {
            if (this.typedText[i] === this.targetText[i]) {
                correctChars++;
            }
        }

        const minutes = elapsed / 60;
        const wpm = minutes > 0 ? Math.round((correctChars / 5) / minutes) : 0;

        this.wpmSamples.push({
            time: elapsed,
            wpm: wpm
        });
    }

    handleKeyUp(e) {
        if (this.isComplete) return;

        this.events.push({
            key: e.key,
            kind: 'keyup',
            t: performance.now()
        });
    }

    handleInput(e) {
        if (this.isComplete) return;

        this.typedText = this.typingInput.value;
        this.renderText();
        this.updateLiveStats();

        // Check if complete (only for words and quote mode)
        if (this.mode !== 'time' && this.typedText.length >= this.targetText.length) {
            this.complete();
        }
    }

    updateLiveStats() {
        if (!this.startTime) return;

        const elapsed = (performance.now() - this.startTime) / 60000; // minutes

        // Count correct characters for Net WPM
        let correctChars = 0;
        for (let i = 0; i < this.typedText.length; i++) {
            if (this.typedText[i] === this.targetText[i]) {
                correctChars++;
            }
        }

        // Net WPM: only correct characters count
        const netWpm = elapsed > 0 ? Math.round((correctChars / 5) / elapsed) : 0;

        // Accuracy
        const accuracy = this.typedText.length > 0
            ? Math.round((correctChars / this.typedText.length) * 100)
            : 100;

        this.liveWpm.textContent = netWpm;
        this.liveAccuracy.textContent = accuracy;
    }

    // Completion
    async complete() {
        this.isComplete = true;
        this.typingInput.disabled = true;

        // Take final WPM sample
        this.sampleWpm();

        // Stop intervals
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
        if (this.wpmSampleInterval) {
            clearInterval(this.wpmSampleInterval);
            this.wpmSampleInterval = null;
        }

        // For timed mode, trim the target text to what was actually attempted
        const effectiveTarget = this.mode === 'time'
            ? this.targetText.substring(0, this.typedText.length)
            : this.targetText;

        const sessionData = {
            target_text: effectiveTarget,
            final_text: this.typedText,
            events: this.events
        };

        try {
            const response = await fetch('/api/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(sessionData)
            });

            const report = await response.json();
            this.showResults(report);
        } catch (error) {
            console.error('Analysis failed:', error);
            alert('Failed to analyze session. Please try again.');
            this.restart();
        }
    }

    showResults(report) {
        // Hide typing, show results
        this.typingArea.classList.add('hidden');
        this.resultsPanel.classList.remove('hidden');

        // Hide mode options on results page
        document.querySelector('.header-right').classList.add('hidden');

        // Main metrics - show both Net WPM and Raw WPM
        document.getElementById('result-wpm').textContent = Math.round(report.basic.wpm);
        document.getElementById('result-raw-wpm').textContent = Math.round(report.basic.raw_wpm);
        document.getElementById('result-accuracy').textContent =
            `${Math.round(report.basic.accuracy * 100)}%`;
        document.getElementById('result-duration').textContent =
            `${(report.basic.duration_ms / 1000).toFixed(1)}s`;
        document.getElementById('result-corrections').textContent =
            report.corrections.backspace_count;
        document.getElementById('result-latency').textContent =
            report.basic.avg_interkey_latency_ms
                ? `${Math.round(report.basic.avg_interkey_latency_ms)}ms`
                : '-';

        // Details
        document.getElementById('result-spikes').textContent =
            report.hesitation.spikes.length;
        document.getElementById('result-bursts').textContent =
            report.corrections.correction_bursts;

        const bigrams = Object.entries(report.ngrams.bigram_latency_ms)
            .slice(0, 3)
            .map(([bg, _]) => `"${bg}"`)
            .join(', ');
        document.getElementById('result-bigrams').textContent = bigrams || '-';

        // Insights
        const insightsList = document.getElementById('insights-list');
        insightsList.innerHTML = report.insights
            .map((insight, i) => `<li style="animation-delay: ${i * 0.1}s">${insight}</li>`)
            .join('');

        // Render charts
        this.renderWpmChart();
        this.renderKeyboardHeatmap(report.per_key.latency_ms);
    }

    renderWpmChart() {
        const ctx = document.getElementById('wpm-chart').getContext('2d');
        const style = getComputedStyle(document.body);
        const accent = style.getPropertyValue('--accent').trim();
        const textMuted = style.getPropertyValue('--text-muted').trim();

        // Destroy existing chart if any
        if (this.wpmChart) {
            this.wpmChart.destroy();
        }

        // Prepare data from wpmSamples
        const labels = this.wpmSamples.map(s => `${s.time.toFixed(1)}s`);
        const data = this.wpmSamples.map(s => s.wpm);

        this.wpmChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'WPM',
                    data: data,
                    borderColor: accent,
                    backgroundColor: `${accent}20`,
                    borderWidth: 2,
                    fill: true,
                    tension: 0.3,
                    pointRadius: 0,
                    pointHoverRadius: 4,
                    pointHoverBackgroundColor: accent
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        displayColors: false,
                        callbacks: {
                            label: function(context) {
                                return `${context.parsed.y} WPM`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        display: true,
                        grid: { color: `${textMuted}20` },
                        ticks: { color: textMuted, maxTicksLimit: 10 }
                    },
                    y: {
                        display: true,
                        beginAtZero: true,
                        grid: { color: `${textMuted}20` },
                        ticks: { color: textMuted }
                    }
                },
                interaction: {
                    intersect: false,
                    mode: 'index'
                }
            }
        });
    }

    renderKeyboardHeatmap(latencyData) {
        const keyboard = document.getElementById('keyboard-heatmap');

        // Keyboard layout
        const rows = [
            ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
            ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
            ['z', 'x', 'c', 'v', 'b', 'n', 'm']
        ];

        // Get min/max latencies for color scaling
        const latencies = Object.values(latencyData).filter(v => v > 0);
        const minLatency = latencies.length > 0 ? Math.min(...latencies) : 50;
        const maxLatency = latencies.length > 0 ? Math.max(...latencies) : 200;

        // Generate keyboard HTML
        let html = '';

        rows.forEach(row => {
            html += '<div class="keyboard-row">';
            row.forEach(key => {
                const latency = latencyData[key] || 0;
                const color = latency > 0
                    ? this.getHeatmapColor(latency, minLatency, maxLatency)
                    : null;
                const className = latency > 0 ? 'key' : 'key unused';
                const style = color ? `background-color: ${color}` : '';
                const title = latency > 0 ? `${key}: ${Math.round(latency)}ms` : `${key}: no data`;
                html += `<div class="${className}" style="${style}" title="${title}">${key.toUpperCase()}</div>`;
            });
            html += '</div>';
        });

        // Add space bar
        const spaceLatency = latencyData[' '] || 0;
        const spaceColor = spaceLatency > 0
            ? this.getHeatmapColor(spaceLatency, minLatency, maxLatency)
            : null;
        const spaceClass = spaceLatency > 0 ? 'key space' : 'key space unused';
        const spaceStyle = spaceColor ? `background-color: ${spaceColor}` : '';
        const spaceTitle = spaceLatency > 0 ? `space: ${Math.round(spaceLatency)}ms` : 'space: no data';
        html += `<div class="keyboard-row"><div class="${spaceClass}" style="${spaceStyle}" title="${spaceTitle}">SPACE</div></div>`;

        keyboard.innerHTML = html;
    }

    getHeatmapColor(value, min, max) {
        // Normalize value between 0 and 1
        const normalized = Math.max(0, Math.min(1, (value - min) / (max - min || 1)));

        // Green (fast) -> Yellow -> Red (slow)
        let r, g, b;
        if (normalized < 0.5) {
            // Green to Yellow
            r = Math.round(255 * (normalized * 2));
            g = 200;
            b = 50;
        } else {
            // Yellow to Red
            r = 255;
            g = Math.round(200 * (1 - (normalized - 0.5) * 2));
            b = 50;
        }

        return `rgb(${r}, ${g}, ${b})`;
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    new KeylyticsApp();
});
