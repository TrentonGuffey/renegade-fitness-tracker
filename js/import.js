import { supabase } from './supabase.js'

// ── MyFitnessPal CSV Import ──
window.handleMFPImport = async (event) => {
    const file = event.target.files[0]
    const msgEl = document.getElementById('mfpMessage')

    if (!file) return

    msgEl.textContent = 'Reading file...'
    msgEl.className = 'form-message'

    const text = await file.text()
    const lines = text.split('\n').filter(l => l.trim())

    if (lines.length < 2) {
        msgEl.textContent = 'File appears empty or invalid.'
        msgEl.className = 'form-message error'
        return
    }

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''))

    const getCol = (row, name) => {
        const idx = headers.findIndex(h => h.includes(name))
        return idx >= 0 ? row[idx]?.replace(/"/g, '').trim() : null
    }

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    const userId = session.user.id
    let inserted = 0
    let skipped = 0

    for (let i = 1; i < lines.length; i++) {
        const row = lines[i].split(',')

        const date = getCol(row, 'date')
        if (!date) continue

        const record = {
            user_id: userId,
            logged_date: date,
            calories: parseFloat(getCol(row, 'calorie') ?? getCol(row, 'energy') ?? 0) || 0,
            protein_g: parseFloat(getCol(row, 'protein') ?? 0) || 0,
            carbs_g: parseFloat(getCol(row, 'carbohydrate') ?? getCol(row, 'carb') ?? 0) || 0,
            fat_g: parseFloat(getCol(row, 'fat') ?? 0) || 0,
            fiber_g: parseFloat(getCol(row, 'fiber') ?? 0) || 0,
            sugar_g: parseFloat(getCol(row, 'sugar') ?? 0) || 0,
            sodium_mg: parseFloat(getCol(row, 'sodium') ?? 0) || 0,
            source: 'myfitnesspal_import'
        }

        // Check for duplicate
        const { data: existing } = await supabase
            .from('nutrition_logs')
            .select('id')
            .eq('user_id', userId)
            .eq('logged_date', date)
            .eq('source', 'myfitnesspal_import')
            .limit(1)

        if (existing?.length > 0) {
            skipped++
            continue
        }

        const { error } = await supabase.from('nutrition_logs').insert(record)
        if (!error) inserted++
    }

    // Log the import
    await supabase.from('import_logs').insert({
        user_id: userId,
        import_type: 'myfitnesspal',
        record_count: inserted,
        status: 'completed'
    })

    msgEl.textContent = `Import complete — ${inserted} records added, ${skipped} duplicates skipped.`
    msgEl.className = 'form-message'
}

// ── Apple Health to Activity Type ID mapping ──
const activityTypeMap = {
    'Walking': '6c1b43d0-3761-4559-9cf9-ca14497b4cd4',
    'Running': '18511d2b-c033-4a8f-9683-cf34a608f47d',
    'Hiking': '2e3e37a6-d845-4c4a-9ab2-b6eb2e7d7844',
    'Cycling': 'ce62a599-8f2a-454b-83a9-81b29467309a',
    'Swimming': 'cf5bb091-8d69-4ffa-8e20-76090ba6a43e',
    'TraditionalStrengthTraining': 'ca05c664-09bc-44d9-aab8-bd1fdcf0fe96',
    'FunctionalStrengthTraining': 'ca05c664-09bc-44d9-aab8-bd1fdcf0fe96',
    'HighIntensityIntervalTraining': 'ca05c664-09bc-44d9-aab8-bd1fdcf0fe96',
    'Elliptical': 'ca05c664-09bc-44d9-aab8-bd1fdcf0fe96',
    'Rowing': 'ca05c664-09bc-44d9-aab8-bd1fdcf0fe96'
}

const getActivityTypeId = (typeName) => activityTypeMap[typeName] ?? '6c1b43d0-3761-4559-9cf9-ca14497b4cd4'

// ── Apple Health XML Import ──
window.handleAppleHealthImport = async (event) => {
    const file = event.target.files[0]
    const msgEl = document.getElementById('appleHealthMessage')

    if (!file) return

    msgEl.textContent = 'Reading Apple Health file... this may take a moment.'
    msgEl.className = 'form-message'

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    const userId = session.user.id

    const text = await file.text()
    const parser = new DOMParser()
    const xml = parser.parseFromString(text, 'text/xml')

    let sleepInserted = 0
    let sleepSkipped = 0
    let workoutInserted = 0

    // ── Sleep Records ──
    const sleepRecords = xml.querySelectorAll('Record[type="HKCategoryTypeIdentifierSleepAnalysis"]')

    const sleepByDate = {}
    sleepRecords.forEach(record => {
        const start = new Date(record.getAttribute('startDate'))
        const end = new Date(record.getAttribute('endDate'))
        const date = start.toISOString().split('T')[0]
        const minutes = Math.round((end - start) / 60000)
        const value = record.getAttribute('value') ?? ''

        if (!sleepByDate[date]) {
            sleepByDate[date] = { total: 0, deep: 0, rem: 0 }
        }

        sleepByDate[date].total += minutes
        if (value.includes('Deep')) sleepByDate[date].deep += minutes
        if (value.includes('REM')) sleepByDate[date].rem += minutes
    })

    for (const [date, data] of Object.entries(sleepByDate)) {
        const { data: existing } = await supabase
            .from('sleep_logs')
            .select('id')
            .eq('user_id', userId)
            .eq('sleep_date', date)
            .eq('source', 'apple_health')
            .limit(1)

        if (existing?.length > 0) {
            sleepSkipped++
            continue
        }

        const { error } = await supabase.from('sleep_logs').insert({
            user_id: userId,
            sleep_date: date,
            duration_minutes: data.total,
            deep_sleep_minutes: data.deep || null,
            rem_sleep_minutes: data.rem || null,
            source: 'apple_health'
        })

        if (!error) sleepInserted++
    }

    // ── Workout Records ──
    const workouts = xml.querySelectorAll('Workout')

    for (const workout of workouts) {
        const type = workout.getAttribute('workoutActivityType') ?? ''
        const start = new Date(workout.getAttribute('startDate'))
        const end = new Date(workout.getAttribute('endDate'))
        const date = start.toISOString().split('T')[0]
        const duration = Math.round((end - start) / 60000)

        const totalDistance = workout.getAttribute('totalDistance')
        const totalDistanceUnit = workout.getAttribute('totalDistanceUnit')
        const distanceVal = totalDistance ? parseFloat(totalDistance) : null

        console.log('Workout:', type, 'Distance:', distanceVal, 'Raw:', distance)

        const { data: logData, error } = await supabase.from('activity_logs').insert({
            user_id: userId,
            activity_type_id: getActivityTypeId(type.replace('HKWorkoutActivityType', '')),
            logged_date: date,
            duration_minutes: duration,
            notes: `Imported from Apple Health: ${type.replace('HKWorkoutActivityType', '')}`,
            source: 'apple_health'
        }).select().single()

        if (!error && logData) {
            workoutInserted++

            // Save distance metric if available
            if (distanceVal && distanceVal > 0) {
                // Find the distance metric definition for this activity type
                const activityTypeName = type.replace('HKWorkoutActivityType', '')
                const mappedTypeId = getActivityTypeId(activityTypeName)

                if (mappedTypeId) {
                    const { data: metricDef } = await supabase
                        .from('metric_definitions')
                        .select('id')
                        .eq('activity_type_id', mappedTypeId)
                        .eq('label', 'Distance')
                        .single()

                    if (metricDef) {
                        // Convert km to miles if needed
                        const distanceMiles = totalDistanceUnit === 'km'
                            ? (distanceVal * 0.621371).toFixed(2)
                            : distanceVal.toFixed(2)

                        await supabase.from('activity_metric_values').insert({
                            activity_log_id: logData.id,
                            metric_definition_id: metricDef.id,
                            value: distanceMiles.toString()
                        })                    }
                }
            }
        }
    }

    // Log the import
    await supabase.from('import_logs').insert({
        user_id: userId,
        import_type: 'apple_health',
        record_count: sleepInserted + workoutInserted,
        status: 'completed'
    })

    msgEl.textContent = `Import complete — ${sleepInserted} sleep records and ${workoutInserted} workouts added. ${sleepSkipped} duplicates skipped.`
    msgEl.className = 'form-message'
}

// ── Bind file inputs after DOM loads ──
document.addEventListener('DOMContentLoaded', () => {
    const appleHealthFile = document.getElementById('appleHealthFile')
    if (appleHealthFile) {
        appleHealthFile.addEventListener('change', handleAppleHealthImport)
    }

    const mfpFile = document.getElementById('mfpFile')
    if (mfpFile) {
        mfpFile.addEventListener('change', handleMFPImport)
    }
})