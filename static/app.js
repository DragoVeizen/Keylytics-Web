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
        this.liveTime = document.getElementById('live-time');

        // State
        this.targetText = '';
        this.typedText = '';
        this.events = [];
        this.startTime = null;
        this.timerInterval = null;
        this.isComplete = false;
        this.mode = 'random';

        // Charts
        this.wpmChart = null;
        this.latencyChart = null;

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
            if (e.key === 'Tab') {
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
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.mode = btn.dataset.mode;
                this.loadNewText();
            });
        });

        // Focus on click
        this.typingArea.addEventListener('click', () => {
            this.typingInput.focus();
        });
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
            const response = await fetch(`/api/text?mode=${this.mode}`);
            const data = await response.json();
            this.targetText = data.text;
        } catch (error) {
            console.error('Failed to load text:', error);
            this.targetText = 'The quick brown fox jumps over the lazy dog.';
        }
        this.reset();
        this.renderText();
    }

    reset() {
        this.typedText = '';
        this.events = [];
        this.startTime = null;
        this.isComplete = false;
        this.typingInput.value = '';
        this.typingInput.disabled = false;

        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }

        this.liveWpm.textContent = '0';
        this.liveAccuracy.textContent = '100';
        this.liveTime.textContent = '0';
        this.progressFill.style.width = '0%';
    }

    restart() {
        this.reset();
        this.renderText();
        this.typingArea.classList.remove('hidden');
        this.resultsPanel.classList.add('hidden');
        this.typingInput.focus();
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

        // Update progress
        const progress = (this.typedText.length / this.targetText.length) * 100;
        this.progressFill.style.width = `${Math.min(progress, 100)}%`;
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
            this.startTimer();
        }

        // Record event
        this.events.push({
            key: e.key,
            kind: 'keydown',
            t: performance.now()
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

        // Check if complete
        if (this.typedText.length >= this.targetText.length) {
            this.complete();
        }
    }

    startTimer() {
        this.timerInterval = setInterval(() => {
            if (this.startTime && !this.isComplete) {
                const elapsed = (performance.now() - this.startTime) / 1000;
                this.liveTime.textContent = Math.floor(elapsed);
            }
        }, 100);
    }

    updateLiveStats() {
        if (!this.startTime) return;

        const elapsed = (performance.now() - this.startTime) / 60000; // minutes
        const words = this.typedText.length / 5;
        const wpm = elapsed > 0 ? Math.round(words / elapsed) : 0;

        let correct = 0;
        for (let i = 0; i < this.typedText.length; i++) {
            if (this.typedText[i] === this.targetText[i]) {
                correct++;
            }
        }
        const accuracy = this.typedText.length > 0
            ? Math.round((correct / this.typedText.length) * 100)
            : 100;

        this.liveWpm.textContent = wpm;
        this.liveAccuracy.textContent = accuracy;
    }

    // Completion
    async complete() {
        this.isComplete = true;
        this.typingInput.disabled = true;

        if (this.timerInterval) {
            clearInterval(this.timerInterval);
        }

        const sessionData = {
            target_text: this.targetText,
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

        // Main metrics
        document.getElementById('result-wpm').textContent = Math.round(report.basic.wpm);
        document.getElementById('result-accuracy').textContent =
            `${Math.round(report.basic.accuracy * 100)}%`;
        document.getElementById('result-duration').textContent =
            `${(report.basic.duration_ms / 1000).toFixed(1)}s`;
        document.getElementById('result-chars').textContent = this.typedText.length;
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
        this.renderCharts(report);
    }

    renderCharts(report) {
        const style = getComputedStyle(document.body);
        const accent = style.getPropertyValue('--accent').trim();
        const textMuted = style.getPropertyValue('--text-muted').trim();
        const bgSecondary = style.getPropertyValue('--bg-secondary').trim();

        // Destroy existing charts
        if (this.wpmChart) this.wpmChart.destroy();
        if (this.latencyChart) this.latencyChart.destroy();

        // WPM Over Time Chart
        const wpmCtx = document.getElementById('wpm-chart').getContext('2d');
        const wpmData = report.wpm_over_time || [];

        this.wpmChart = new Chart(wpmCtx, {
            type: 'line',
            data: {
                labels: wpmData.map(d => `${d.time}s`),
                datasets: [{
                    label: 'WPM',
                    data: wpmData.map(d => d.wpm),
                    borderColor: accent,
                    backgroundColor: `${accent}20`,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 0,
                    pointHoverRadius: 4,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    x: {
                        display: true,
                        grid: { color: `${textMuted}20` },
                        ticks: { color: textMuted, maxTicksLimit: 6 }
                    },
                    y: {
                        display: true,
                        grid: { color: `${textMuted}20` },
                        ticks: { color: textMuted },
                        beginAtZero: true
                    }
                }
            }
        });

        // Key Latency Chart
        const latencyCtx = document.getElementById('latency-chart').getContext('2d');
        const latencyData = Object.entries(report.per_key.latency_ms)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);

        this.latencyChart = new Chart(latencyCtx, {
            type: 'bar',
            data: {
                labels: latencyData.map(([key, _]) => key === ' ' ? 'Space' : key),
                datasets: [{
                    label: 'Latency (ms)',
                    data: latencyData.map(([_, val]) => Math.round(val)),
                    backgroundColor: `${accent}80`,
                    borderColor: accent,
                    borderWidth: 1,
                    borderRadius: 4,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: 'y',
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    x: {
                        display: true,
                        grid: { color: `${textMuted}20` },
                        ticks: { color: textMuted }
                    },
                    y: {
                        display: true,
                        grid: { display: false },
                        ticks: {
                            color: textMuted,
                            font: { family: 'JetBrains Mono' }
                        }
                    }
                }
            }
        });
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    new KeylyticsApp();
});
