import { pipeline, env } from '@xenova/transformers';

// Skip local model check since we are running in the browser
env.allowLocalModels = false;

let transcriber = null;

self.addEventListener('message', async (event) => {
  if (event.data.type === 'load') {
    if (!transcriber) {
      self.postMessage({ status: 'loading' });
      try {
        transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-base');
        self.postMessage({ status: 'ready' });
      } catch (err) {
        self.postMessage({ status: 'error', error: err.message });
      }
    } else {
      self.postMessage({ status: 'ready' });
    }
  } else if (event.data.type === 'transcribe') {
    if (!transcriber) {
      self.postMessage({ status: 'error', error: 'El modelo no está cargado' });
      return;
    }
    const audioData = event.data.audio;
    self.postMessage({ status: 'transcribing' });
    
    try {
      const output = await transcriber(audioData, {
        language: 'spanish',
        task: 'transcribe',
      });
      self.postMessage({ status: 'complete', text: output.text });
    } catch (err) {
      self.postMessage({ status: 'error', error: err.message });
    }
  }
});
