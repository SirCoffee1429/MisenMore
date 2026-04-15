import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'

export default function WeatherWidget({ compact = false }) {
    const [forecastData, setForecastData] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)

    useEffect(() => {
        function getLocation() {
            if ("geolocation" in navigator) {
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        fetchWeatherData(position.coords.latitude, position.coords.longitude)
                    },
                    (err) => {
                        console.warn("Geolocation denied or failed. Using default location.", err)
                        fetchWeatherData(38.9517, -92.3341) // Default: Columbia, MO
                    },
                    { timeout: 10000 }
                )
            } else {
                fetchWeatherData(38.9517, -92.3341)
            }
        }

        async function fetchWeatherData(lat, lng) {
            try {
                const { data, error: invokeError } = await supabase.functions.invoke('get-weather', {
                    body: { lat, lng }
                })

                if (invokeError) throw invokeError
                
                // The Google Weather API returns { forecastDays: [...] }
                if (data && data.forecastDays && data.forecastDays.length > 0) {
                    setForecastData(data.forecastDays)
                } else if (data && data.error) {
                    throw new Error(data.error)
                } else {
                    throw new Error("No forecast data available for this location.")
                }
            } catch (err) {
                console.error("DEBUG: Weather Fetch Error:", err)
                setError(err.message || String(err))
            } finally {
                setLoading(false)
            }
        }

        getLocation()
        
        // Refresh weather every 2 hours
        const intervalId = setInterval(() => getLocation(), 120 * 60 * 1000)
        return () => clearInterval(intervalId)
    }, [])

    function getWeatherIcon(type) {
        if (!type) return 'fa-cloud'
        const typeUpper = type.toUpperCase()
        if (typeUpper.includes('CLEAR') || typeUpper.includes('SUNNY')) return 'fa-sun'
        if (typeUpper.includes('RAIN') || typeUpper.includes('DRIZZLE')) return 'fa-cloud-rain'
        if (typeUpper.includes('SNOW')) return 'fa-snowflake'
        if (typeUpper.includes('THUNDER')) return 'fa-cloud-bolt'
        if (typeUpper.includes('PARTLY') || typeUpper.includes('SCATTERED')) return 'fa-cloud-sun'
        if (typeUpper.includes('CLOUDY')) return 'fa-cloud'
        return 'fa-cloud'
    }

    function getWeatherColor(type) {
        if (!type) return 'weather-color-cloudy'
        const typeUpper = type.toUpperCase()
        if (typeUpper.includes('CLEAR') || typeUpper.includes('SUNNY')) return 'weather-color-sunny'
        if (typeUpper.includes('RAIN') || typeUpper.includes('DRIZZLE')) return 'weather-color-rainy'
        if (typeUpper.includes('SNOW')) return 'weather-color-snowy'
        if (typeUpper.includes('THUNDER')) return 'weather-color-thunder'
        if (typeUpper.includes('PARTLY') || typeUpper.includes('SCATTERED')) return 'weather-color-partly'
        return 'weather-color-cloudy'
    }

    // Helper to get day string (e.g., "Mon")
    function getDayLabel(dateString) {
        if (!dateString) return ''
        const date = new Date(dateString)
        const today = new Date()
        
        // Ensure same day format comparison
        const formatString = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
        const dateFormatted = formatString(date)
        const todayFormatted = formatString(today)
        
        if (dateFormatted === todayFormatted) return 'Today'
        
        return date.toLocaleDateString('en-US', { weekday: 'short' })
    }

    if (loading) {
        return (
            <div className="weather-forecast-card loading">
                <div className="weather-forecast-shimmer"></div>
            </div>
        )
    }

    if (error || forecastData.length === 0) {
        return (
            <div className={compact ? "office-v2-weather-compact" : "weather-forecast-card"}>
                {!compact && (
                    <h2 className="weather-card-title">
                        <i className="fa-solid fa-cloud-sun" /> 5-Day Forecast
                    </h2>
                )}
                <div style={{ padding: 'var(--space-4)', textAlign: 'center', width: '100%', color: 'var(--text-secondary)' }}>
                    <i className="fa-solid fa-triangle-exclamation" style={{ fontSize: '24px', marginBottom: '8px', color: 'var(--warning)' }}></i>
                    <p style={{ margin: 0, fontSize: '14px' }}>Weather unavailable: {error || 'No data returned'}</p>
                </div>
            </div>
        )
    }

    // Compact mode for the office dashboard — shows 3 days in a small inline card
    if (compact) {
        return (
            <div className="office-v2-weather-compact" style={{ height: '100%', alignItems: 'center' }}>
                {forecastData.slice(0, 3).map((dayData, index) => {
                    // Read the correct fields from Google Weather API response
                    const maxTemp = Math.round(dayData.maxTemperature?.degrees || 0)
                    const minTemp = Math.round(dayData.minTemperature?.degrees || 0)
                    const weatherType = dayData.daytimeForecast?.weatherCondition?.type || 'UNKNOWN'
                    const precip = dayData.daytimeForecast?.precipitation?.probability?.percent || 0

                    // Build day label from the forecast date
                    const dateLabel = getDayLabel(dayData.updateTime || new Date(new Date().setDate(new Date().getDate() + index)).toISOString())
                    const displayLabel = dateLabel === 'Today' ? 'TODAY' : dateLabel.toUpperCase()

                    const iconClass = getWeatherIcon(weatherType)

                    // Color mapping for the icon
                    const isSunny = iconClass.includes('sun')
                    const isRainy = iconClass.includes('rain') || iconClass.includes('cloud-bolt')
                    let overrideColor = '#9ca3af'
                    if (isSunny && !isRainy) overrideColor = '#fcd34d'
                    if (isRainy) overrideColor = '#60a5fa'

                    return (
                        <div key={index} className="office-v2-weather-day">
                            <div style={{ fontSize: '0.75rem', color: '#9ca3af', fontWeight: 600, marginBottom: '0.25rem' }}>{displayLabel}</div>
                            <div style={{ fontSize: '0.875rem', fontWeight: 500, color: '#fff', marginBottom: '0.25rem' }}>{maxTemp}°/{minTemp}°</div>
                            <i className={`fa-solid ${iconClass}`} style={{ color: overrideColor, marginBottom: '0.25rem', fontSize: '1.25rem' }}></i>
                            <div style={{ fontSize: '10px', color: overrideColor }}>{precip}%</div>
                        </div>
                    )
                })}
            </div>
        )
    }

    return (
        <div className="weather-forecast-card">
            <h2 className="weather-card-title">
                <i className="fa-solid fa-cloud-sun" /> 5-Day Forecast
            </h2>
            <div className="forecast-container">
                {forecastData.map((day, index) => {
                    // Extracting nested data cautiously
                    const maxTemp = Math.round(day.maxTemperature?.degrees || 0)
                    const minTemp = Math.round(day.minTemperature?.degrees || 0)
                    const conditionType = day.daytimeForecast?.weatherCondition?.type
                    const conditionDesc = day.daytimeForecast?.weatherCondition?.description?.text || ''
                    const iconClass = getWeatherIcon(conditionType)
                    const colorClass = getWeatherColor(conditionType)
                    
                    const precip = day.daytimeForecast?.precipitation?.probability?.percent || 0
                    const rawCloudCoverage = day.daytimeForecast?.cloudCover || 0 // Default to 0
                    const cloudCoverage = Math.round(rawCloudCoverage)

                    const dateLabel = getDayLabel(day.updateTime || new Date(new Date().setDate(new Date().getDate() + index)).toISOString())

                    return (
                        <div key={index} className="forecast-block">
                            <h3 className="forecast-day-label">{dateLabel}</h3>
                            <div className={`forecast-icon ${colorClass}`}>
                                <i className={`fa-solid ${iconClass}`} title={conditionDesc}></i>
                            </div>
                            <div className="forecast-temps">
                                <span className="temp-high">{maxTemp}°</span>
                                <span className="temp-divider">/</span>
                                <span className="temp-low">{minTemp}°</span>
                            </div>
                            <div className="forecast-metrics">
                                <div className="forecast-metric" title="Precipitation Probability">
                                    <i className="fa-solid fa-droplet metric-icon precip" />
                                    <span>{precip}%</span>
                                </div>
                                <div className="forecast-metric" title="Cloud Coverage">
                                    <i className="fa-solid fa-cloud metric-icon cloud" />
                                    <span>{cloudCoverage}%</span>
                                </div>
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
