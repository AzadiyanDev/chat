import { Injectable, signal, inject } from '@angular/core';
import { VoiceStorageService } from './voice-storage.service';

export interface VoiceResult {
  blob: Blob;
  blobUrl: string;
  durationMs: number;
  waveform: number[];
  storageKey: string;
}

@Injectable({ providedIn: 'root' })
export class VoiceRecorderService {
  private storageService = inject(VoiceStorageService);
  
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  
  isRecording = signal<boolean>(false);
  recordingDuration = signal<number>(0); // visible seconds
  private timerInterval: any;
  private audioCtx: AudioContext | null = null;

  private getAudioCtx(): AudioContext {
    if (!this.audioCtx) this.audioCtx = new AudioContext();
    return this.audioCtx;
  }

  async startRecording(): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mediaRecorder = new MediaRecorder(stream);
      this.audioChunks = [];

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) this.audioChunks.push(event.data);
      };

      this.mediaRecorder.start();
      this.isRecording.set(true);
      this.recordingDuration.set(0);
      
      this.timerInterval = setInterval(() => {
        this.recordingDuration.update(d => d + 1);
      }, 1000);
      
    } catch (err) {
      console.error('Microphone access error:', err);
      alert('Microphone access is required to record voice messages.');
    }
  }

  stopRecording(): Promise<VoiceResult | null> {
    return new Promise((resolve) => {
      if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
        return resolve(null);
      }

      this.mediaRecorder.onstop = async () => {
        clearInterval(this.timerInterval);
        const blob = new Blob(this.audioChunks, { type: 'audio/webm' });
        
        let durationMs = this.recordingDuration() * 1000;
        let waveform: number[] = [];
        
        try {
          // Decode audio to get exact duration and amplitude data
          const arrayBuffer = await blob.arrayBuffer();
          const audioBuffer = await this.getAudioCtx().decodeAudioData(arrayBuffer.slice(0));
          durationMs = audioBuffer.duration * 1000;
          
          // Generate 50 points of waveform
          const channelData = audioBuffer.getChannelData(0);
          const samples = 50;
          const blockSize = Math.floor(channelData.length / samples);
          for (let i = 0; i < samples; i++) {
            let sum = 0;
            for (let j = 0; j < blockSize; j++) {
              sum += Math.abs(channelData[i * blockSize + j]);
            }
            waveform.push(sum / blockSize);
          }
          
          // Normalize to 0.1 - 1.0 range
          const maxVal = Math.max(...waveform, 0.01);
          waveform = waveform.map(v => Math.max(0.1, v / maxVal));

        } catch (e) {
          console.error("Audio decode error, using fallback", e);
          // Fallback dummy waveform if decoding fails
          waveform = Array.from({ length: 50 }, () => Math.random() * 0.8 + 0.2);
        }
        
        const storageKey = 'voice_' + Date.now() + '_' + Math.random().toString(36).substr(2,5);
        await this.storageService.saveVoice(storageKey, blob);
        const blobUrl = URL.createObjectURL(blob);
        
        this.isRecording.set(false);
        this.recordingDuration.set(0);
        this.mediaRecorder?.stream.getTracks().forEach(track => track.stop());
        this.mediaRecorder = null;
        
        resolve({ blob, blobUrl, durationMs, waveform, storageKey });
      };

      this.mediaRecorder.stop();
    });
  }

  cancelRecording() {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
      clearInterval(this.timerInterval);
      this.isRecording.set(false);
      this.recordingDuration.set(0);
      this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
      this.mediaRecorder = null;
    }
  }
}