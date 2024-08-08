let offlineAudioContext;
let renderedBuffer;
let renderButton;
let modalOverlay, modalContent, progressBar, downloadButton;

// Создаем кнопку Render
renderButton = document.createElement('button');
renderButton.textContent = 'Render';
document.body.appendChild(renderButton);

// Создаем модальное окно
function createModal() {
    modalOverlay = document.createElement('div');
    modalOverlay.style.position = 'fixed';
    modalOverlay.style.top = '0';
    modalOverlay.style.left = '0';
    modalOverlay.style.width = '100%';
    modalOverlay.style.height = '100%';
    modalOverlay.style.backgroundColor = 'rgba(0,0,0,0.5)';
    modalOverlay.style.display = 'none';
    modalOverlay.style.justifyContent = 'center';
    modalOverlay.style.alignItems = 'center';

    modalContent = document.createElement('div');
    modalContent.style.backgroundColor = 'white';
    modalContent.style.padding = '20px';
    modalContent.style.borderRadius = '5px';
    modalContent.style.textAlign = 'center';

    progressBar = document.createElement('progress');
    progressBar.style.width = '100%';
    progressBar.max = 100;
    progressBar.value = 0;

    downloadButton = document.createElement('button');
    downloadButton.textContent = 'Download';
    downloadButton.style.display = 'none';
    downloadButton.addEventListener('click', downloadRenderedAudio);

    modalContent.appendChild(progressBar);
    modalContent.appendChild(document.createElement('br'));
    modalContent.appendChild(downloadButton);
    modalOverlay.appendChild(modalContent);
    document.body.appendChild(modalOverlay);
}

// Функция для рендеринга аудио
async function renderAudio() {
    const duration = audioPlayer.duration;
    offlineAudioContext = new OfflineAudioContext(2, duration * audioContext.sampleRate, audioContext.sampleRate);
    
    const offlineSource = offlineAudioContext.createBufferSource();
    const response = await fetch(audioPlayer.src);
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    offlineSource.buffer = audioBuffer;

    let lastNode = offlineSource;
    bands.forEach(band => {
        if (band.type !== 'default') {
            const filter = offlineAudioContext.createBiquadFilter();
            filter.type = band.type;
            filter.frequency.value = band.freq;
            filter.gain.value = band.gain;
            filter.Q.value = band.Q;
            lastNode.connect(filter);
            lastNode = filter;
        }
    });

    lastNode.connect(offlineAudioContext.destination);
    offlineSource.start();

    modalOverlay.style.display = 'flex';
    progressBar.value = 0;

    offlineAudioContext.startRendering().then(renderedBuffer => {
        progressBar.value = 100;
        downloadButton.style.display = 'inline-block';
    }).catch(err => {
        console.error('Rendering failed: ', err);
    });

    offlineAudioContext.addEventListener('complete', (event) => {
        renderedBuffer = event.renderedBuffer;
    });
}

// Функция для скачивания рендеринга
function downloadRenderedAudio() {
    const wav = audioBufferToWav(renderedBuffer);
    const blob = new Blob([wav], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = 'rendered_audio.wav';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    }, 100);
}

// Функция для конвертации AudioBuffer в WAV
function audioBufferToWav(buffer, opt) {
    opt = opt || {};

    var numChannels = buffer.numberOfChannels;
    var sampleRate = buffer.sampleRate;
    var format = opt.float32 ? 3 : 1;
    var bitDepth = format === 3 ? 32 : 16;

    var result;
    if (numChannels === 2) {
        result = interleave(buffer.getChannelData(0), buffer.getChannelData(1));
    } else {
        result = buffer.getChannelData(0);
    }

    return encodeWAV(result, format, sampleRate, numChannels, bitDepth);
}

function interleave(inputL, inputR) {
    var length = inputL.length + inputR.length;
    var result = new Float32Array(length);

    var index = 0;
    var inputIndex = 0;

    while (index < length) {
        result[index++] = inputL[inputIndex];
        result[index++] = inputR[inputIndex];
        inputIndex++;
    }
    return result;
}

function encodeWAV(samples, format, sampleRate, numChannels, bitDepth) {
    var bytesPerSample = bitDepth / 8;
    var blockAlign = numChannels * bytesPerSample;

    var buffer = new ArrayBuffer(44 + samples.length * bytesPerSample);
    var view = new DataView(buffer);

    /* RIFF identifier */
    writeString(view, 0, 'RIFF');
    /* RIFF chunk length */
    view.setUint32(4, 36 + samples.length * bytesPerSample, true);
    /* RIFF type */
    writeString(view, 8, 'WAVE');
    /* format chunk identifier */
    writeString(view, 12, 'fmt ');
    /* format chunk length */
    view.setUint32(16, 16, true);
    /* sample format (raw) */
    view.setUint16(20, format, true);
    /* channel count */
    view.setUint16(22, numChannels, true);
    /* sample rate */
    view.setUint32(24, sampleRate, true);
    /* byte rate (sample rate * block align) */
    view.setUint32(28, sampleRate * blockAlign, true);
    /* block align (channel count * bytes per sample) */
    view.setUint16(32, blockAlign, true);
    /* bits per sample */
    view.setUint16(34, bitDepth, true);
    /* data chunk identifier */
    writeString(view, 36, 'data');
    /* data chunk length */
    view.setUint32(40, samples.length * bytesPerSample, true);
    if (format === 1) { // Raw PCM
        floatTo16BitPCM(view, 44, samples);
    } else {
        writeFloat32(view, 44, samples);
    }

    return buffer;
}

function writeString(view, offset, string) {
    for (var i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}

function floatTo16BitPCM(output, offset, input) {
    for (var i = 0; i < input.length; i++, offset += 2) {
        var s = Math.max(-1, Math.min(1, input[i]));
        output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
}

function writeFloat32(output, offset, input) {
    for (var i = 0; i < input.length; i++, offset += 4) {
        output.setFloat32(offset, input[i], true);
    }
}

// Инициализация
createModal();

renderButton.addEventListener('click', renderAudio);


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
        <label for="frequency-${index}">Frequency<br><span id="frequency-value-${index}">1000</span> Hz</label>
        <input type="range" id="gain-${index}" min="-12" max="12" value="0">
        <label for="gain-${index}">Gain<br><span id="gain-value-${index}">0</span> dB</label>
        <input type="range" id="Q-${index}" min="0.1" max="10" step="0.1" value="1">
        <label for="Q-${index}">Q<br><span id="Q-value-${index}">1</span></label>
        <select id="type-${index}">
            <option value="default">Off</option>
            <option value="peaking">Peaking</option>
            <option value="lowpass">Lowpass</option>
            <option value="highpass">Highpass</option>
            <option value="bandpass">Bandpass</option>
        </select>
        <label for="type-${index}">Type<br>${index}</label>
        <button class="solo-button" id="solo-${index}">Solo</button>
        <h3>Compressor</h3>
        <input type="range" id="compressor-threshold-${index}" min="-60" max="0" value="-24" step="0.1">
        <label for="compressor-threshold-${index}">Threshold<br><span id="compressor-threshold-value-${index}">-24</span> dB</label>
        <input type="range" id="compressor-knee-${index}" min="0" max="40" value="30" step="0.1">
        <label for="compressor-knee-${index}">Knee<br><span id="compressor-knee-value-${index}">30</span></label>
        <input type="range" id="compressor-ratio-${index}" min="1" max="20" value="12" step="0.1">
        <label for="compressor-ratio-${index}">Ratio<br><span id="compressor-ratio-value-${index}">12</span></label>
        <input type="range" id="compressor-attack-${index}" min="0" max="1" value="0.003" step="0.001">
        <label for="compressor-attack-${index}">Attack<br><span id="compressor-attack-value-${index}">0.003</span></label>
        <input type="range" id="compressor-release-${index}" min="0" max="1" value="0.25" step="0.01">
        <label for="compressor-release-${index}">Release<br><span id="compressor-release-value-${index}">0.25</span></label>
    `;
    controlsContainer.appendChild(bandDiv);

    const soloButton = bandDiv.querySelector(`#solo-${index}`);
    soloButton.addEventListener('click', () => toggleSolo(index));

    // Add event listeners to update the values
    document.getElementById(`frequency-${index}`).addEventListener('input', (event) => {
        document.getElementById(`frequency-value-${index}`).textContent = event.target.value;
    });

    document.getElementById(`gain-${index}`).addEventListener('input', (event) => {
        document.getElementById(`gain-value-${index}`).textContent = event.target.value;
    });

    document.getElementById(`Q-${index}`).addEventListener('input', (event) => {
        document.getElementById(`Q-value-${index}`).textContent = event.target.value;
    });

    document.getElementById(`compressor-threshold-${index}`).addEventListener('input', (event) => {
        document.getElementById(`compressor-threshold-value-${index}`).textContent = event.target.value;
    });

    document.getElementById(`compressor-knee-${index}`).addEventListener('input', (event) => {
        document.getElementById(`compressor-knee-value-${index}`).textContent = event.target.value;
    });

    document.getElementById(`compressor-ratio-${index}`).addEventListener('input', (event) => {
        document.getElementById(`compressor-ratio-value-${index}`).textContent = event.target.value;
    });

    document.getElementById(`compressor-attack-${index}`).addEventListener('input', (event) => {
        document.getElementById(`compressor-attack-value-${index}`).textContent = event.target.value;
    });

    document.getElementById(`compressor-release-${index}`).addEventListener('input', (event) => {
        document.getElementById(`compressor-release-value-${index}`).textContent = event.target.value;
    });
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
    solo: false,
    compressor: audioContext.createDynamicsCompressor(),
    threshold: -24,
    knee: 30,
    ratio: 12,
    attack: 0.003,
    release: 0.25
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
        band.compressor.disconnect();
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

                band.compressor.threshold.value = band.threshold;
                band.compressor.knee.value = band.knee;
                band.compressor.ratio.value = band.ratio;
                band.compressor.attack.value = band.attack;
                band.compressor.release.value = band.release;

                lastNode.connect(band.filter);
                band.filter.connect(band.compressor);
                lastNode = band.compressor;
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
        band.threshold = parseFloat(document.getElementById(`compressor-threshold-${index}`).value);
        band.knee = parseFloat(document.getElementById(`compressor-knee-${index}`).value);
        band.ratio = parseFloat(document.getElementById(`compressor-ratio-${index}`).value);
        band.attack = parseFloat(document.getElementById(`compressor-attack-${index}`).value);
        band.release = parseFloat(document.getElementById(`compressor-release-${index}`).value);
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
