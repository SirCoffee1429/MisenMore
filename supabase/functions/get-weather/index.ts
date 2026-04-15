import "jsr:@supabase/functions-js/edge-runtime.d.ts"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const url = new URL(req.url)
        let lat = url.searchParams.get('lat')
        let lng = url.searchParams.get('lng')

        // Parse lat/lng from POST body if available
        if (req.method === 'POST') {
            try {
                const body = await req.json()
                if (body.lat) lat = body.lat
                if (body.lng) lng = body.lng
            } catch (e) {
                // Ignore JSON parse errors for empty bodies
            }
        }

        if (!lat || !lng) {
            return new Response(
                JSON.stringify({ error: 'Latitude and longitude are required' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
            )
        }

        const apiKey = Deno.env.get('GOOGLE_WEATHER_API_KEY')
        if (!apiKey) {
            return new Response(
                JSON.stringify({ error: 'Google Weather API key is not configured' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
            )
        }

        // Call Google Weather API for 5-day forecast
        const weatherUrl = `https://weather.googleapis.com/v1/forecast/days:lookup?key=${apiKey}&location.latitude=${lat}&location.longitude=${lng}&unitsSystem=IMPERIAL&days=5`

        // Include Referer header to satisfy API key HTTP referrer restriction
        const weatherRes = await fetch(weatherUrl, {
            headers: {
                'Referer': 'https://brief-club.vercel.app/',
            }
        })

        if (!weatherRes.ok) {
            const errorText = await weatherRes.text()
            console.error('Google Weather API error:', errorText)
            throw new Error(`Google Weather API error: ${weatherRes.status} - ${errorText}`)
        }

        const weatherData = await weatherRes.json()

        return new Response(
            JSON.stringify(weatherData),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    } catch (error) {
        const err = error as Error;
        console.error(err)
        return new Response(
            JSON.stringify({ error: err.message }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        )
    }
})
