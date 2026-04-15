import { useState, useRef, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase.js'
import useVoiceInput, { isVoiceSupported } from '../lib/useVoiceInput.js'

export default function AssistantWidget({ externalOpen, onExternalClose, voiceMode, onVoiceModeEnd }) {
    const [isOpen, setIsOpen] = useState(false)
    const [messages, setMessages] = useState([
        { role: 'assistant', text: 'Hey there! 👋 Ask me anything about your recipes or latest sales.' }
    ])
    const [input, setInput] = useState('')
    const [loading, setLoading] = useState(false)
    const [showVoiceOverlay, setShowVoiceOverlay] = useState(false)
    const messagesEndRef = useRef(null)

    const suggestedPrompts = [
        "What sold the most this week?",
        "What % of sales were Handhelds?",
        "How many Pretzel Bites did we sell?",
        "Whats the recipe for French Onion Soup?"
    ]

    // Voice input hook
    const handleVoiceResult = useCallback((text) => {
        setShowVoiceOverlay(false)
        onVoiceModeEnd?.()
        if (text) submitQuestion(text)
    }, [])

    const { isListening, transcript, error: voiceError, startListening, stopListening } = useVoiceInput({
        onResult: handleVoiceResult,
    })

    // Sync with external open state (from nav bar center button)
    useEffect(() => {
        if (externalOpen !== undefined) {
            setIsOpen(externalOpen)
        }
    }, [externalOpen])

    // Handle voice mode activation from parent (long-press)
    useEffect(() => {
        if (voiceMode && isOpen) {
            if (!isVoiceSupported()) {
                setMessages(prev => [...prev, { role: 'assistant', text: '⚠️ Voice input is not supported in this browser. Please try Chrome or Edge.' }])
                onVoiceModeEnd?.()
                return
            }
            setShowVoiceOverlay(true)
            startListening()
        }
    }, [voiceMode, isOpen])

    function handleClose() {
        setIsOpen(false)
        setShowVoiceOverlay(false)
        stopListening()
        if (onExternalClose) onExternalClose()
    }

    useEffect(() => {
        if (isOpen) {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
        }
    }, [messages, isOpen])

    async function submitQuestion(question) {
        if (!question || loading) return

        setMessages(prev => [...prev, { role: 'user', text: question }])
        setLoading(true)

        try {
            const { data, error } = await supabase.functions.invoke('kitchen-assistant', {
                body: { question },
            })

            if (error) throw error

            const answer = data?.answer
                || 'Sorry, I couldn\'t generate a response. Please try again.'

            setMessages(prev => [...prev, { role: 'assistant', text: answer }])
        } catch (err) {
            console.error('Assistant error:', err)
            setMessages(prev => [...prev, { role: 'assistant', text: '⚠️ Something went wrong. Check the console for details.' }])
        }

        setLoading(false)
    }

    async function handleSend(e) {
        e.preventDefault()
        const question = input.trim()
        if (!question || loading) return

        setInput('')
        await submitQuestion(question)
    }

    function handleMicClick() {
        if (!isVoiceSupported()) {
            setMessages(prev => [...prev, { role: 'assistant', text: '⚠️ Voice input is not supported in this browser.' }])
            return
        }
        if (isListening) {
            stopListening()
        } else {
            setShowVoiceOverlay(true)
            startListening()
        }
    }

    function handleVoiceDone() {
        stopListening()
    }

    function handleVoiceCancel() {
        stopListening()
        setShowVoiceOverlay(false)
        onVoiceModeEnd?.()
    }

    return (
        <div className="assistant-widget-container">
            {isOpen && (
                <div className="assistant-widget-window">
                    <div className="assistant-widget-header">
                        <div className="assistant-widget-title">
                            <i className="fa-solid fa-robot"></i> Kitchen Assistant
                        </div>
                        <button className="assistant-widget-close" onClick={handleClose}>
                            <i className="fa-solid fa-xmark"></i>
                        </button>
                    </div>

                    {/* Voice listening overlay */}
                    {showVoiceOverlay && (
                        <div className="voice-overlay">
                            <div className="voice-overlay-content">
                                <div className={`voice-mic-icon ${isListening ? 'listening' : ''}`}>
                                    <i className="fa-solid fa-microphone"></i>
                                    {isListening && <div className="voice-mic-ring"></div>}
                                    {isListening && <div className="voice-mic-ring ring-2"></div>}
                                </div>
                                <div className="voice-status">
                                    {isListening ? 'Listening…' : 'Processing…'}
                                </div>
                                {transcript && (
                                    <div className="voice-transcript">"{transcript}"</div>
                                )}
                                {voiceError && (
                                    <div className="voice-error">{voiceError}</div>
                                )}
                                <div className="voice-actions">
                                    {isListening && (
                                        <button className="btn btn-primary voice-done-btn" onClick={handleVoiceDone}>
                                            <i className="fa-solid fa-check"></i> Done
                                        </button>
                                    )}
                                    <button className="btn btn-secondary voice-cancel-btn" onClick={handleVoiceCancel}>
                                        <i className="fa-solid fa-xmark"></i> Cancel
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="assistant-widget-messages">
                        {messages.map((msg, i) => (
                            <div key={i} className={`chat-bubble ${msg.role}`}>
                                {msg.text}
                            </div>
                        ))}
                        {messages.length === 1 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px', padding: '0 8px' }}>
                                {suggestedPrompts.map((prompt, i) => (
                                    <button
                                        key={i}
                                        className="btn btn-secondary btn-sm"
                                        style={{ justifyContent: 'flex-start', textAlign: 'left', whiteSpace: 'normal', height: 'auto', padding: '8px 12px' }}
                                        onClick={() => submitQuestion(prompt)}
                                    >
                                        <i className="fa-solid fa-sparkles" style={{ color: 'var(--orange)' }}></i> {prompt}
                                    </button>
                                ))}
                            </div>
                        )}
                        {loading && (
                            <div className="chat-bubble assistant" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                                <span className="spinner" style={{ width: '16px', height: '16px', borderWidth: '2px' }} /> Thinking...
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>
                    <form className="assistant-widget-input" onSubmit={handleSend}>
                        <input
                            className="input"
                            style={{ padding: '8px 12px', fontSize: '13px' }}
                            placeholder="Ask a question..."
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            disabled={loading}
                        />
                        {isVoiceSupported() && (
                            <button
                                type="button"
                                className={`mic-btn ${isListening ? 'active' : ''}`}
                                onClick={handleMicClick}
                                disabled={loading}
                                aria-label="Voice input"
                            >
                                <i className="fa-solid fa-microphone"></i>
                            </button>
                        )}
                        <button className="btn btn-primary btn-sm" style={{ padding: '8px 12px' }} type="submit" disabled={loading || !input.trim()}>
                            <i className="fa-solid fa-paper-plane"></i>
                        </button>
                    </form>
                </div>
            )}

            <button
                className={`assistant-widget-fab ${isOpen ? 'open' : ''}`}
                onClick={() => isOpen ? handleClose() : setIsOpen(true)}
                aria-label="Toggle Assistant"
            >
                {isOpen ? <i className="fa-solid fa-xmark"></i> : <i className="fa-solid fa-message"></i>}
            </button>
        </div>
    )
}
