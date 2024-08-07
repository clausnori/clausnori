const audioContext = new AudioContext();
        const canvas = document.getElementById('eq-canvas');
        const ctx = canvas.getContext('2d');
        const fileInput = document.getElementById('file-input');
        const playplay = document.getElementById('play-play');
        const audioPlayer = document.getElementById('audio-player');
        const controlsContainer = document.getElementById('eq-controls');
        const maxBands = 6;
        const bands = [];
        let source, analyser;

        function createBandControls(index) {
            const bandDiv = document.createElement('div');
            bandDiv.classList.add('control');
            bandDiv.innerHTML = `
                <input type="range" id="frequency-${index}" min="80" max="20000" value="1000">
                <label for="frequency-${index}">Frequency<br>${index}</label>
                <input type="range" id="gain-${index}" min="-12" max="12" value="0">
                <label for="gain-${index}">Gain<br>${index}</label>
                <input type="range" id="Q-${index}" min="0.1" max="10" step="0.1" value="1">
                <label for="Q-${index}">Q<br>${index}</label>
                <select id="type-${index}">
                    <option value="default">Off</option>
                    <option value="peaking">Peaking</option>
                    <option value="lowpass">Lowpass</option>
                    <option value="highpass">Highpass</option>
                    <option value="bandpass">Bandpass</option>
                </select>
                <label for="type-${index}">Type<br>${index}</label>
                <button class="solo-button" id="solo-${index}">Solo</button>
            `;
            controlsContainer.appendChild(bandDiv);

            const soloButton = bandDiv.querySelector(`#solo-${index}`);
            soloButton.addEventListener('click', () => toggleSolo(index));
        }

        function setupBands() {
            for (let i = 0; i < maxBands; i++) {
                createBandControls(i);
                bands.push({
                    freq: 1000,
                    gain: 0,
                    Q: 1,
                    type: 'default',
                    filter: audioContext.createBiquadFilter(),
                    solo: false
                });
            }
        }

        function connectFilters() {
            source = audioContext.createMediaElementSource(audioPlayer);
            analyser = audioContext.createAnalyser();
            analyser.fftSize = 2048;

            updateFilterChain();
        }

        function updateFilterChain() {
            source.disconnect();
            bands.forEach(band => {
                band.filter.disconnect();
                if (band.bandpassFilter) band.bandpassFilter.disconnect();
                if (band.notchFilter) band.notchFilter.disconnect();
            });

            let lastNode = source;
            const soloActive = bands.some(band => band.solo);

            bands.forEach((band, index) => {
                if (band.type !== 'default') {
                    if (soloActive && band.solo) {
                        // Solo mode for this band
                        if (!band.bandpassFilter) {
                            band.bandpassFilter = audioContext.createBiquadFilter();
                            band.notchFilter = audioContext.createBiquadFilter();
                        }
                        
                        // Set up bandpass filter
                        band.bandpassFilter.type = 'bandpass';
                        band.bandpassFilter.frequency.value = band.freq;
                        band.bandpassFilter.Q.value = band.Q;
                        
                        // Set up notch filter
                        band.notchFilter.type = 'notch';
                        band.notchFilter.frequency.value = band.freq;
                        band.notchFilter.Q.value = band.Q;
                        
                        // Connect the filters
                        lastNode.connect(band.bandpassFilter);
                        lastNode.connect(band.notchFilter);
                        
                        // Subtract notch from original
                        const gainNode = audioContext.createGain();
                        gainNode.gain.value = -1;
                        band.notchFilter.connect(gainNode);
                        
                        const sumNode = audioContext.createGain();
                        lastNode.connect(sumNode);
                        gainNode.connect(sumNode);
                        band.bandpassFilter.connect(sumNode);
                        
                        lastNode = sumNode;
                    } else if (!soloActive) {
                        // Normal mode
                        band.filter.type = band.type;
                        band.filter.frequency.value = band.freq;
                        band.filter.gain.value = band.gain;
                        band.filter.Q.value = band.Q;
                        lastNode.connect(band.filter);
                        lastNode = band.filter;
                    }
                }
            });

            lastNode.connect(analyser);
            analyser.connect(audioContext.destination);
        }

        function updateFilters() {
            bands.forEach((band, index) => {
                band.type = document.getElementById(`type-${index}`).value;
                band.freq = parseFloat(document.getElementById(`frequency-${index}`).value);
                band.gain = parseFloat(document.getElementById(`gain-${index}`).value);
                band.Q = parseFloat(document.getElementById(`Q-${index}`).value);
            });

            updateFilterChain();
        }

        function toggleSolo(index) {
            bands[index].solo = !bands[index].solo;
            const soloButton = document.getElementById(`solo-${index}`);
            soloButton.classList.toggle('active', bands[index].solo);

            // Deactivate solo for other bands
            bands.forEach((band, i) => {
                if (i !== index) {
                    band.solo = false;
                    document.getElementById(`solo-${i}`).classList.remove('active');
                }
            });

            updateFilterChain();
        }

        function draw() {
    requestAnimationFrame(draw);

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    analyser.getByteFrequencyData(dataArray);

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw frequency data with logarithmic scaling (gray spectrogram)
    const logFrequencyScale = (x) => {
        const minLog = Math.log10(80);
        const maxLog = Math.log10(20000);
        return Math.pow(10, minLog + (x / canvas.width) * (maxLog - minLog));
    };

    for (let x = 0; x < canvas.width; x++) {
        const freq = logFrequencyScale(x);
        const index = Math.round(freq / audioContext.sampleRate * bufferLength);
        const value = dataArray[index] || 0;
        const y = canvas.height - (value / 256 * canvas.height);

        ctx.beginPath();
        ctx.moveTo(x, canvas.height);
        ctx.lineTo(x, y);
        ctx.strokeStyle = '#606060';
        ctx.stroke();
        ctx.closePath();
    }

    // Draw EQ curve with colored filters
    ctx.beginPath();
    ctx.moveTo(0, canvas.height / 2); // Start from the center vertically

    const soloActive = bands.some(band => band.solo);

    for (let x = 0; x < canvas.width; x++) {
        const freq = logFrequencyScale(x);
        let gain = 0;
        bands.forEach(band => {
            if (!soloActive || band.solo) {
                const f = band.filter.frequency.value;
                const g = band.filter.gain.value;
                const q = band.filter.Q.value;
                gain += g / (1 + Math.pow((freq - f) / (f / q), 2));
            }
        });
        const y = canvas.height / 2 - (gain * canvas.height / 24); // Height from the center line

        if (x === 0) {
            ctx.moveTo(x, y);
        } else {
            const prevX = x - 1;
            const prevFreq = logFrequencyScale(prevX);
            let prevGain = 0;
            bands.forEach(band => {
                if (!soloActive || band.solo) {
                    const f = band.filter.frequency.value;
                    const g = band.filter.gain.value;
                    const q = band.filter.Q.value;
                    prevGain += g / (1 + Math.pow((prevFreq - f) / (f / q), 2));
                }
            });
            const prevY = canvas.height / 2 - (prevGain * canvas.height / 24); // Height from the center line

            ctx.bezierCurveTo(prevX + (x - prevX) / 2, prevY, x - (x - prevX) / 2, y, x, y);
        }
    }

    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Highlight each filter's effect
    bands.forEach((band, index) => {
        if (!soloActive || band.solo) {
            ctx.beginPath();
            ctx.moveTo(0, canvas.height / 2);
            for (let x = 0; x < canvas.width; x++) {
                const freq = logFrequencyScale(x);
                const f = band.filter.frequency.value;
                const g = band.filter.gain.value;
                const q = band.filter.Q.value;
                const gainEffect = g / (1 + Math.pow((freq - f) / (f / q), 2));
                const y = canvas.height / 2 - (gainEffect * canvas.height / 24);

                if (x === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            }

            ctx.lineTo(canvas.width, canvas.height / 2);
            ctx.lineTo(0, canvas.height / 2);
            ctx.closePath();

            // Set the color for each filter's effect
            ctx.fillStyle = `rgba(${(index + 1) * 50}, ${(index + 1) * 100}, 150, 0.3)`;
            ctx.fill();
        }
    });
}
playplay.addEventListener('click', () => {
    audioContext.resume().then(() => {
        audioPlayer.play();
    });
});

        fileInput.addEventListener('change', function(e) {
    const file = e.target.files[0];
    audioPlayer.src = URL.createObjectURL(file);
    audioPlayer.onloadedmetadata = function() {
        audioPlayer.loop = true; // Устанавливаем повторное воспроизведение
        audioPlayer.play();
        setupBands();
        connectFilters();
        draw();
    }
});

        controlsContainer.addEventListener('input', updateFilters);
