import { supabase } from './supabase.js'

// ── Auth Guard ──
const { data: { session } } = await supabase.auth.getSession()
if (!session) window.location.href = 'index.html'

const user = session.user
const displayName = user.user_metadata?.display_name || user.email

// ── Set User Name in Nav ──
document.getElementById('navUserName').textContent = displayName

// ── Set Dashboard Date ──
document.getElementById('dashboardDate').textContent = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
})

// ── Set Default Log Date ──
document.getElementById('logDate').value = new Date().toISOString().split('T')[0]

// ── Section Navigation ──
window.showSection = (name) => {
    document.querySelectorAll('.app-section').forEach(s => s.classList.remove('active'))
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'))
    document.getElementById(`section-${name}`).classList.add('active')
    document.querySelectorAll('.nav-item').forEach(b => {
        if (b.getAttribute('onclick')?.includes(name)) b.classList.add('active')
    })
}

// ── Logout ──
window.handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.href = 'index.html'
}

// ── Load Dashboard Stats ──
const loadDashboardStats = async () => {
    const now = new Date()
    const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString()

    // Weekly activities
    const { data: activities } = await supabase
        .from('activity_logs')
        .select('*, activity_metric_values(*)')
        .eq('user_id', user.id)
        .gte('logged_date', weekAgo.split('T')[0])

    document.getElementById('statWeeklyActivities').textContent = activities?.length ?? 0

    // Latest body weight
    const { data: weightData } = await supabase
        .from('body_metrics')
        .select('weight')
        .eq('user_id', user.id)
        .order('logged_date', { ascending: false })
        .limit(1)

    if (weightData?.length > 0) {
        document.getElementById('statBodyWeight').textContent = weightData[0].weight
    }

    // Recent activity list
    const { data: recentData } = await supabase
        .from('activity_logs')
        .select('*, activity_types(name)')
        .eq('user_id', user.id)
        .order('logged_date', { ascending: false })
        .limit(5)

    const recentEl = document.getElementById('recentActivity')
    if (recentData?.length > 0) {
        recentEl.innerHTML = recentData.map(a => `
      <div class="activity-item">
        <div class="activity-name">${a.activity_types?.name ?? 'Activity'}</div>
        <div class="activity-meta">${a.logged_date} · ${a.duration_minutes ?? '—'} min</div>
        ${a.notes ? `<div class="activity-notes">${a.notes}</div>` : ''}
      </div>
    `).join('')
    }
}

// ── Load Next Event Countdown ──
const loadNextEvent = async () => {
    const today = new Date().toISOString().split('T')[0]

    const { data: events } = await supabase
        .from('events')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .gte('event_date', today)
        .order('event_date', { ascending: true })
        .limit(1)

    if (events?.length > 0) {
        const event = events[0]
        const daysAway = Math.ceil((new Date(event.event_date) - new Date()) / (1000 * 60 * 60 * 24))
        document.getElementById('countdownName').textContent = event.name
        document.getElementById('countdownDays').textContent = daysAway
    }
}

// ── Load Activity Types for Log Form ──
const loadEventActivityTypes = async () => {
    const select = document.getElementById('eventActivityType')
    select.innerHTML = '<option value="">Select type...</option>'

    const { data, error } = await supabase
        .from('activity_types')
        .select('*')
        .order('name')

    if (error) {
        console.error('Error loading activity types:', error)
        return
    }

    data?.forEach(type => {
        const opt = document.createElement('option')
        opt.value = type.id
        opt.textContent = type.name
        select.appendChild(opt)
    })
}
// ── Load Dynamic Metric Fields ──
window.loadMetricFields = async () => {
    const typeId = document.getElementById('logActivityType').value
    const container = document.getElementById('dynamicMetricFields')
    container.innerHTML = ''

    if (!typeId) return

    const { data: metrics } = await supabase
        .from('metric_definitions')
        .select('*')
        .eq('activity_type_id', typeId)
        .order('label')

    if (metrics?.length > 0) {
        metrics.forEach(metric => {
            const div = document.createElement('div')
            div.className = 'form-group'
            div.innerHTML = `
        <label>${metric.label}${metric.unit ? ` (${metric.unit})` : ''}</label>
        <input 
          type="${metric.data_type === 'number' ? 'number' : 'text'}" 
          id="metric_${metric.id}" 
          placeholder="${metric.label}"
          ${metric.is_required ? 'required' : ''}
        />
      `
            container.appendChild(div)
        })
    }
}

// ── Log Activity ──
window.handleLogActivity = async () => {
    const typeId = document.getElementById('logActivityType').value
    const date = document.getElementById('logDate').value
    const duration = document.getElementById('logDuration').value
    const notes = document.getElementById('logNotes').value
    const msgEl = document.getElementById('logMessage')

    if (!typeId || !date) {
        msgEl.textContent = 'Please select an activity type and date.'
        msgEl.className = 'form-message error'
        return
    }

    msgEl.textContent = 'Saving...'
    msgEl.className = 'form-message'

    // Insert activity log
    const { data: logData, error: logError } = await supabase
        .from('activity_logs')
        .insert({
            user_id: user.id,
            activity_type_id: typeId,
            logged_date: date,
            duration_minutes: duration ? parseInt(duration) : null,
            notes: notes || null,
            source: 'manual'
        })
        .select()
        .single()

    if (logError) {
        msgEl.textContent = logError.message
        msgEl.className = 'form-message error'
        return
    }

    // Insert metric values
    const { data: metrics } = await supabase
        .from('metric_definitions')
        .select('*')
        .eq('activity_type_id', typeId)

    if (metrics?.length > 0) {
        const metricValues = metrics
            .map(m => ({
                activity_log_id: logData.id,
                metric_definition_id: m.id,
                value: document.getElementById(`metric_${m.id}`)?.value || null
            }))
            .filter(m => m.value)

        if (metricValues.length > 0) {
            await supabase.from('activity_metric_values').insert(metricValues)
        }
    }

    msgEl.textContent = 'Activity saved!'
    msgEl.className = 'form-message'

    // Reset form
    document.getElementById('logActivityType').value = ''
    document.getElementById('logDuration').value = ''
    document.getElementById('logNotes').value = ''
    document.getElementById('dynamicMetricFields').innerHTML = ''

    loadDashboardStats()
}

// ── Save Profile ──
window.saveProfile = async () => {
    const name = document.getElementById('profileName').value.trim()
    const weight = document.getElementById('profileWeight').value
    const msgEl = document.getElementById('profileMessage')

    if (name) {
        await supabase.auth.updateUser({ data: { display_name: name } })
        document.getElementById('navUserName').textContent = name
    }

    if (weight) {
        await supabase.from('body_metrics').insert({
            user_id: user.id,
            logged_date: new Date().toISOString().split('T')[0],
            weight: parseFloat(weight),
            weight_unit: 'lbs'
        })
    }

    msgEl.textContent = 'Profile saved!'
    msgEl.className = 'form-message'
    loadDashboardStats()
}

// ── Password Reset ──
window.handlePasswordReset = async () => {
    const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
        redirectTo: window.location.origin + '/index.html'
    })
    const msgEl = document.getElementById('profileMessage')
    msgEl.textContent = error ? error.message : 'Password reset email sent!'
    msgEl.className = error ? 'form-message error' : 'form-message'
}

// ── Export for Claude ──
window.exportForClaude = async () => {
    const days = document.getElementById('exportRange').value
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    const { data: activities } = await supabase
        .from('activity_logs')
        .select('*, activity_types(name), activity_metric_values(*, metric_definitions(label, unit))')
        .eq('user_id', user.id)
        .gte('logged_date', cutoff)
        .order('logged_date', { ascending: false })

    const { data: nutrition } = await supabase
        .from('nutrition_logs')
        .select('*')
        .eq('user_id', user.id)
        .gte('logged_date', cutoff)
        .order('logged_date', { ascending: false })

    const { data: bodyMetrics } = await supabase
        .from('body_metrics')
        .select('*')
        .eq('user_id', user.id)
        .gte('logged_date', cutoff)
        .order('logged_date', { ascending: false })

    const { data: events } = await supabase
        .from('events')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'active')

    let output = `RENEGADE FITNESS TRACKER — EXPORT\n`
    output += `User: ${displayName}\n`
    output += `Period: Last ${days} days (${cutoff} to ${new Date().toISOString().split('T')[0]})\n`
    output += `Generated: ${new Date().toLocaleString()}\n\n`

    output += `── ACTIVE EVENTS ──\n`
    events?.forEach(e => {
        const daysAway = Math.ceil((new Date(e.event_date) - new Date()) / (1000 * 60 * 60 * 24))
        output += `• ${e.name} — ${e.event_date} (${daysAway} days away)\n`
    })

    output += `\n── ACTIVITIES (${activities?.length ?? 0} logged) ──\n`
    activities?.forEach(a => {
        output += `\n${a.logged_date} | ${a.activity_types?.name} | ${a.duration_minutes ?? '—'} min\n`
        a.activity_metric_values?.forEach(mv => {
            output += `  ${mv.metric_definitions?.label}: ${mv.value} ${mv.metric_definitions?.unit ?? ''}\n`
        })
        if (a.notes) output += `  Notes: ${a.notes}\n`
    })

    output += `\n── BODY WEIGHT ──\n`
    bodyMetrics?.forEach(b => {
        output += `${b.logged_date}: ${b.weight} ${b.weight_unit}\n`
    })

    output += `\n── NUTRITION SUMMARY ──\n`
    nutrition?.forEach(n => {
        output += `${n.logged_date}: ${n.calories} cal | P:${n.protein_g}g C:${n.carbs_g}g F:${n.fat_g}g\n`
    })

    document.getElementById('exportOutput').value = output
}

// ── Add some activity item styles dynamically ──
const style = document.createElement('style')
style.textContent = `
  .activity-item { padding: 12px 0; border-bottom: 1px solid #1e293b; }
  .activity-item:last-child { border-bottom: none; }
  .activity-name { font-size: 14px; font-weight: 600; color: #f1f5f9; }
  .activity-meta { font-size: 12px; color: #64748b; margin-top: 2px; }
  .activity-notes { font-size: 12px; color: #94a3b8; margin-top: 4px; font-style: italic; }
`
document.head.appendChild(style)

// ── Toggle Add Event Form ──
window.toggleAddEvent = () => {
    const form = document.getElementById('addEventForm')
    if (!form) {
        console.error('addEventForm not found')
        return
    }
    const isVisible = form.style.display === 'block'
    form.style.display = isVisible ? 'none' : 'block'
    if (!isVisible) loadEventActivityTypes()
}

// ── Load Activity Types for Event Form ──
const loadEventActivityTypes = async () => {
    const select = document.getElementById('eventActivityType')
    select.innerHTML = '<option value="">Select type...</option>'

    const { data } = await supabase
        .from('activity_types')
        .select('*')
        .or(`user_id.eq.${user.id},is_default.eq.true`)
        .order('name')

    data?.forEach(type => {
        const opt = document.createElement('option')
        opt.value = type.id
        opt.textContent = type.name
        select.appendChild(opt)
    })
}

// ── Handle Add Event ──
window.handleAddEvent = async () => {
    const name = document.getElementById('eventName').value.trim()
    const date = document.getElementById('eventDate').value
    const activityTypeId = document.getElementById('eventActivityType').value
    const goalDistance = document.getElementById('eventGoalDistance').value
    const goalTime = document.getElementById('eventGoalTime').value
    const goalWeight = document.getElementById('eventGoalWeight').value
    const notes = document.getElementById('eventNotes').value
    const msgEl = document.getElementById('eventMessage')

    if (!name || !date) {
        msgEl.textContent = 'Event name and date are required.'
        msgEl.className = 'form-message error'
        return
    }

    msgEl.textContent = 'Saving event...'
    msgEl.className = 'form-message'

    const goalMetrics = {}
    if (goalDistance) goalMetrics.distance_miles = parseFloat(goalDistance)
    if (goalTime) goalMetrics.goal_time = goalTime
    if (goalWeight) goalMetrics.pack_weight_lbs = parseFloat(goalWeight)

    const { error } = await supabase.from('events').insert({
        user_id: user.id,
        name,
        event_date: date,
        event_type_id: activityTypeId || null,
        goal_metrics: goalMetrics,
        notes: notes || null,
        status: 'active'
    })

    if (error) {
        msgEl.textContent = error.message
        msgEl.className = 'form-message error'
        return
    }

    msgEl.textContent = 'Event saved!'
    msgEl.className = 'form-message'

    // Reset form
    document.getElementById('eventName').value = ''
    document.getElementById('eventDate').value = ''
    document.getElementById('eventActivityType').value = ''
    document.getElementById('eventGoalDistance').value = ''
    document.getElementById('eventGoalTime').value = ''
    document.getElementById('eventGoalWeight').value = ''
    document.getElementById('eventNotes').value = ''

    // Reload events and countdown
    setTimeout(() => {
        document.getElementById('addEventForm').style.display = 'none'
        loadEvents()
        loadNextEvent()
    }, 1000)
}

// ── Load Events List ──
const loadEvents = async () => {
    const { data: events } = await supabase
        .from('events')
        .select('*')
        .eq('user_id', user.id)
        .order('event_date', { ascending: true })

    const el = document.getElementById('eventsList')

    if (!events?.length) {
        el.innerHTML = '<p class="empty-state">No events added yet.</p>'
        return
    }

    el.innerHTML = events.map(e => {
        const daysAway = Math.ceil((new Date(e.event_date) - new Date()) / (1000 * 60 * 60 * 24))
        const isPast = daysAway < 0
        const goals = e.goal_metrics ?? {}

        return `
      <div class="event-item">
        <div class="event-item-header">
          <div class="event-item-name">${e.name}</div>
          <div class="event-item-badge ${isPast ? 'past' : ''}">${isPast ? 'Completed' : `${daysAway}d`}</div>
        </div>
        <div class="event-item-date">${e.event_date}</div>
        <div class="event-item-goals">
          ${goals.distance_miles ? `<span>📍 ${goals.distance_miles} miles</span>` : ''}
          ${goals.goal_time ? `<span>⏱ ${goals.goal_time}</span>` : ''}
          ${goals.pack_weight_lbs ? `<span>🎒 ${goals.pack_weight_lbs} lbs</span>` : ''}
        </div>
        <div style="display:flex; gap:8px; margin-top:10px;">
          <button class="btn-secondary" style="padding:6px 12px; font-size:12px;" 
            onclick="markEventComplete('${e.id}')">
            ${isPast ? '✓ Completed' : 'Mark Complete'}
          </button>
          <button class="btn-secondary" style="padding:6px 12px; font-size:12px; color:#ef4444; border-color:#ef4444;" 
            onclick="deleteEvent('${e.id}')">
            Delete
          </button>
        </div>
      </div>
    `
    }).join('')
}

// ── Mark Event Complete ──
window.markEventComplete = async (id) => {
    await supabase.from('events').update({ status: 'completed' }).eq('id', id)
    loadEvents()
    loadNextEvent()
}

// ── Delete Event ──
window.deleteEvent = async (id) => {
    if (!confirm('Delete this event?')) return
    await supabase.from('events').delete().eq('id', id)
    loadEvents()
    loadNextEvent()
}

// ── Add Event Item Styles ──
const eventStyle = document.createElement('style')
eventStyle.textContent = `
  .event-item {
    padding: 14px 0;
    border-bottom: 1px solid #334155;
  }
  .event-item:last-child { border-bottom: none; }
  .event-item-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 4px;
  }
  .event-item-name {
    font-size: 15px;
    font-weight: 600;
    color: #f1f5f9;
  }
  .event-item-badge {
    font-size: 12px;
    font-weight: 600;
    color: #3b82f6;
    background: #3b82f620;
    padding: 3px 10px;
    border-radius: 99px;
  }
  .event-item-badge.past {
    color: #10b981;
    background: #10b98120;
  }
  .event-item-date {
    font-size: 12px;
    color: #64748b;
    margin-bottom: 8px;
  }
  .event-item-goals {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
  }
  .event-item-goals span {
    font-size: 12px;
    color: #94a3b8;
  }
`
document.head.appendChild(eventStyle)

// ── Add loadEvents to Initialize ──
document.addEventListener('DOMContentLoaded', () => {
    loadDashboardStats()
    loadNextEvent()
    loadActivityTypes()
    loadEvents()
})