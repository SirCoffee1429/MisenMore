import { useState, useRef, useCallback } from 'react'

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition

export function isVoiceSupported() {
    return !!SpeechRecognition
}

export default function useVoiceInput({ onResult, onError } = {}) {
    const [isListening, setIsListening] = useState(false)
    const [transcript, setTranscript] = useState('')
    const [error, setError] = useState(null)
    const recognitionRef = useRef(null)
    // Stores the transcript synchronously — no React render needed
    const transcriptRef = useRef('')

    const startListening = useCallback(() => {
        if (!SpeechRecognition) {
            const msg = 'Voice input is not supported in this browser.'
            setError(msg)
            onError?.(msg)
            return
        }

        // Stop any existing session
        if (recognitionRef.current) {
            try { recognitionRef.current.abort() } catch (_) { /* noop */ }
        }

        // Reset the transcript ref
        transcriptRef.current = ''

        const recognition = new SpeechRecognition()
        recognition.continuous = false
        recognition.interimResults = true
        recognition.lang = 'en-US'

        recognition.onstart = () => {
            setIsListening(true)
            setTranscript('')
            transcriptRef.current = ''
            setError(null)
        }

        recognition.onresult = (event) => {
            let interim = ''
            let final = ''
            for (let i = 0; i < event.results.length; i++) {
                const result = event.results[i]
                if (result.isFinal) {
                    final += result[0].transcript
                } else {
                    interim += result[0].transcript
                }
            }
            const current = final || interim
            // Update ref synchronously so onend always sees the latest value
            transcriptRef.current = current
            setTranscript(current)
        }

        recognition.onend = () => {
            setIsListening(false)
            // Read directly from the ref — always has the latest transcript
            const finalTranscript = transcriptRef.current
            if (finalTranscript && finalTranscript.trim()) {
                onResult?.(finalTranscript.trim())
            }
            recognitionRef.current = null
        }

        recognition.onerror = (event) => {
            // 'no-speech' and 'aborted' are not real errors
            if (event.error === 'no-speech' || event.error === 'aborted') {
                setIsListening(false)
                return
            }
            const msg = `Voice error: ${event.error}`
            setError(msg)
            setIsListening(false)
            onError?.(msg)
        }

        recognitionRef.current = recognition

        try {
            recognition.start()
        } catch (err) {
            console.error('Speech recognition start error:', err)
            setError('Could not start voice input.')
            setIsListening(false)
        }
    }, [onResult, onError])

    const stopListening = useCallback(() => {
        if (recognitionRef.current) {
            try { recognitionRef.current.stop() } catch (_) { /* noop */ }
        }
    }, [])

    return { isListening, transcript, error, startListening, stopListening }
}

