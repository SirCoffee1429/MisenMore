import { useState, useRef, useCallback } from 'react'
import { NavLink } from 'react-router-dom'
import AssistantWidget from './AssistantWidget.jsx'


export default function KitchenLayout({ children }) {
    const [assistantOpen, setAssistantOpen] = useState(false)
    const [voiceMode, setVoiceMode] = useState(false)
    const [longPressActive, setLongPressActive] = useState(false)
    const longPressTimer = useRef(null)
    const didTriggerVoice = useRef(false)

    const handlePointerDown = useCallback(() => {
        didTriggerVoice.current = false
        setLongPressActive(true)
        longPressTimer.current = setTimeout(() => {
            didTriggerVoice.current = true
            setLongPressActive(false)
            setVoiceMode(true)
            setAssistantOpen(true)
        }, 1500)
    }, [])

    const handlePointerUp = useCallback(() => {
        clearTimeout(longPressTimer.current)
        setLongPressActive(false)
        // If voice mode was NOT triggered, treat as normal tap
        if (!didTriggerVoice.current) {
            setAssistantOpen(prev => !prev)
        }
    }, [])

    const handlePointerLeave = useCallback(() => {
        clearTimeout(longPressTimer.current)
        setLongPressActive(false)
    }, [])

    return (
        <div className="app-shell">
            <main className="main-content">
                {children}
            </main>

            {/* Assistant widget — FAB hidden on mobile via CSS; chat panel still works */}
            <AssistantWidget
                externalOpen={assistantOpen}
                onExternalClose={() => { setAssistantOpen(false); setVoiceMode(false) }}
                voiceMode={voiceMode}
                onVoiceModeEnd={() => setVoiceMode(false)}
            />


            <nav className="bottom-tab-bar">
                <NavLink
                    to="/kitchen"
                    end
                    className={({ isActive }) => `bottom-tab-link ${isActive ? 'active' : ''}`}
                >
                    <i className="tab-icon fa-solid fa-table-cells-large" />
                    <span className="tab-label">Brief</span>
                </NavLink>

                <NavLink
                    to="/kitchen/sales"
                    className={({ isActive }) => `bottom-tab-link ${isActive ? 'active' : ''}`}
                >
                    <i className="tab-icon fa-solid fa-chart-line" />
                    <span className="tab-label">Sales</span>
                </NavLink>

                {/* Center assistant button — raised orange FAB on mobile, with long-press voice */}
                <button
                    className={`bottom-tab-link bottom-tab-center ${assistantOpen ? 'active' : ''} ${longPressActive ? 'long-press-active' : ''}`}
                    onPointerDown={handlePointerDown}
                    onPointerUp={handlePointerUp}
                    onPointerLeave={handlePointerLeave}
                    onContextMenu={e => e.preventDefault()}
                    aria-label="Toggle Assistant (hold for voice)"
                >
                    <i className={`tab-icon fa-solid ${longPressActive ? 'fa-microphone' : 'fa-brain'}`} />
                    <span className="tab-label">Assistant</span>
                </button>

                <NavLink
                    to="/kitchen/recipes"
                    className={({ isActive }) => `bottom-tab-link ${isActive ? 'active' : ''}`}
                >
                    <i className="tab-icon fa-solid fa-utensils" />
                    <span className="tab-label">Recipes</span>
                </NavLink>

                <NavLink
                    to="/kitchen/chat"
                    className={({ isActive }) => `bottom-tab-link ${isActive ? 'active' : ''}`}
                >
                    <i className="tab-icon fa-solid fa-list-check" />
                    <span className="tab-label">Tasks</span>
                </NavLink>
            </nav>
        </div>
    )
}
