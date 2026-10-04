import React, { useCallback, useEffect, useState } from 'react';
import {
  createAdminSponsoredEvent,
  fetchAdminSponsoredEventDisputes,
  fetchAdminSponsoredEventReport,
  fetchAdminSponsoredEvents,
  refreshAdminSponsoredEventStandings,
  resolveAdminSponsoredEventDispute,
  updateAdminSponsoredEvent,
  updateAdminSponsoredPrize,
} from '../utils/typingApi';

const blankForm = () => ({
  id: null,
  name: '',
  description: '',
  image: 'T',
  sponsorName: '',
  sponsorLogoUrl: '',
  poweredBy: '',
  sponsorMessage: '',
  sponsorLink: '',
  startsAt: '',
  endsAt: '',
  eligibility: 'Signed-in TypeArena accounts only.',
  rules: '',
  fundingPledged: '',
  fundingReceived: '',
  prizes: [
    { description: '1st place prize', value: '' },
    { description: '2nd place prize', value: '' },
    { description: '3rd place prize', value: '' },
  ],
});

const localDateTime = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
};

const serializeForm = (form) => ({
  ...form,
  startsAt: new Date(form.startsAt).toISOString(),
  endsAt: new Date(form.endsAt).toISOString(),
  fundingPledged: Number(form.fundingPledged || 0),
  fundingReceived: Number(form.fundingReceived || 0),
  prizes: form.prizes.map((prize) => ({ ...prize, value: Number(prize.value || 0) })),
});

export default function SponsoredEventsAdmin() {
  const [events, setEvents] = useState([]);
  const [form, setForm] = useState(blankForm);
  const [report, setReport] = useState(null);
  const [disputes, setDisputes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');

  const loadEvents = useCallback(async () => {
    const result = await fetchAdminSponsoredEvents();
    setEvents(Array.isArray(result.events) ? result.events : []);
  }, []);

  useEffect(() => {
    let active = true;
    fetchAdminSponsoredEvents()
      .then((result) => {
        if (active) setEvents(Array.isArray(result.events) ? result.events : []);
      })
      .catch((error) => {
        if (active) setNotice(error.message || 'Could not load sponsored events.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const updateForm = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const updatePrize = (index, key, value) => setForm((current) => ({
    ...current,
    prizes: current.prizes.map((prize, prizeIndex) => (
      prizeIndex === index ? { ...prize, [key]: value } : prize
    )),
  }));

  const editEvent = (event) => {
    setForm({
      id: event.id,
      name: event.name || '',
      description: event.description || '',
      image: event.image || 'T',
      sponsorName: event.sponsorName || '',
      sponsorLogoUrl: event.sponsorLogoUrl || '',
      poweredBy: event.poweredBy || '',
      sponsorMessage: event.sponsorMessage || '',
      sponsorLink: event.sponsorLink || '',
      startsAt: localDateTime(event.startsAt),
      endsAt: localDateTime(event.endsAt),
      eligibility: event.eligibility || '',
      rules: event.rules || '',
      fundingPledged: String(event.fundingPledged || 0),
      fundingReceived: String(event.fundingReceived || 0),
      prizes: [1, 2, 3].map((place) => {
        const prize = event.prizes.find((item) => item.place === place);
        return {
          description: prize?.description || `${place}${place === 1 ? 'st' : place === 2 ? 'nd' : 'rd'} place prize`,
          value: String(prize?.value ?? ''),
        };
      }),
    });
    setReport(null);
    setDisputes([]);
  };

  const loadReport = async (event) => {
    try {
      const [reportResult, disputeResult] = await Promise.all([
        fetchAdminSponsoredEventReport(event.id),
        fetchAdminSponsoredEventDisputes(event.id),
      ]);
      setReport({ eventId: event.id, ...reportResult.report });
      setDisputes(Array.isArray(disputeResult.disputes) ? disputeResult.disputes : []);
      setNotice('');
    } catch (error) {
      setNotice(error.message || 'Could not load event report.');
    }
  };

  const saveEvent = async (event) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      const payload = serializeForm(form);
      const result = form.id
        ? await updateAdminSponsoredEvent(form.id, payload)
        : await createAdminSponsoredEvent(payload);
      setNotice(result.message || 'Sponsored event saved.');
      setForm(blankForm());
      await loadEvents();
    } catch (error) {
      setNotice(error.message || 'Could not save sponsored event.');
    } finally {
      setSaving(false);
    }
  };

  const refreshStandings = async (event) => {
    try {
      const result = await refreshAdminSponsoredEventStandings(event.id);
      setEvents((current) => current.map((item) => (
        item.id === event.id ? { ...item, prizes: result.prizes.map((prize) => ({
          place: prize.place,
          description: prize.prizeDescription,
          value: prize.prizeValue,
          status: prize.status,
          winnerUsername: prize.winnerUsername,
          points: prize.points,
          raceCount: prize.raceCount,
        })) } : item
      )));
      setNotice(result.message || 'Podium refreshed.');
    } catch (error) {
      setNotice(error.message || 'Could not refresh standings.');
    }
  };

  const updatePrizeStatus = async (event, prize, status) => {
    try {
      const result = await updateAdminSponsoredPrize(event.id, prize.place, { status });
      setNotice(result.message || 'Prize updated.');
      await loadEvents();
    } catch (error) {
      setNotice(error.message || 'Could not update prize.');
    }
  };

  const resolveDispute = async (event, dispute, status) => {
    const adminResponse = window.prompt('Optional response to the participant:') || '';
    try {
      await resolveAdminSponsoredEventDispute(event.id, dispute.id, { status, adminResponse });
      await loadReport(event);
      setNotice(`Dispute marked ${status}.`);
    } catch (error) {
      setNotice(error.message || 'Could not resolve dispute.');
    }
  };

  return (
    <section>
      <div className="ap-section-header">
        <h1 className="ap-section-title">Sponsored Tournaments</h1>
        <p className="ap-section-sub">Free-entry sponsor events, prize review, and aggregate sponsor reporting.</p>
      </div>
      {notice && <div className="ap-toast" role="status">{notice}</div>}

      <form className="ap-card" onSubmit={saveEvent}>
        <p className="ap-card-title">{form.id ? 'Edit Sponsored Tournament' : 'Create Sponsored Tournament'}</p>
        <p className="ap-muted">Entry is free. Each player’s best verified race of up to 90 seconds counts at 95% accuracy or higher; finishing the passage or pressing Finish ends the race early.</p>
        <div className="ap-two-col">
          {[
            ['Tournament name', 'name', 'text'],
            ['Sponsor name', 'sponsorName', 'text'],
            ['Sponsor logo URL', 'sponsorLogoUrl', 'url'],
            ['Powered by label', 'poweredBy', 'text'],
            ['Sponsor link', 'sponsorLink', 'url'],
            ['Icon / emoji', 'image', 'text'],
            ['Event starts', 'startsAt', 'datetime-local'],
            ['Event ends', 'endsAt', 'datetime-local'],
            ['Funding pledged (KES)', 'fundingPledged', 'number'],
            ['Funding received (KES)', 'fundingReceived', 'number'],
          ].map(([label, key, type]) => (
            <div className="ap-field" key={key}>
              <label className="ap-label" htmlFor={`sponsor-${key}`}>{label}</label>
              <input
                id={`sponsor-${key}`}
                className="ap-input"
                type={type}
                min={type === 'number' ? '0' : undefined}
                value={form[key]}
                onChange={(e) => updateForm(key, e.target.value)}
                required={['name', 'sponsorName', 'startsAt', 'endsAt'].includes(key)}
              />
            </div>
          ))}
        </div>
        <div className="ap-field">
          <label className="ap-label" htmlFor="sponsor-description">Event description</label>
          <textarea id="sponsor-description" className="ap-input" rows="2" value={form.description} onChange={(e) => updateForm('description', e.target.value)} />
        </div>
        <div className="ap-field">
          <label className="ap-label" htmlFor="sponsor-message">Sponsor message</label>
          <textarea id="sponsor-message" className="ap-input" rows="2" value={form.sponsorMessage} onChange={(e) => updateForm('sponsorMessage', e.target.value)} />
        </div>
        <div className="ap-field">
          <label className="ap-label" htmlFor="sponsor-eligibility">Eligibility</label>
          <textarea id="sponsor-eligibility" className="ap-input" rows="2" value={form.eligibility} onChange={(e) => updateForm('eligibility', e.target.value)} required />
        </div>
        <div className="ap-field">
          <label className="ap-label" htmlFor="sponsor-rules">Event rules and scoring</label>
          <textarea id="sponsor-rules" className="ap-input" rows="4" value={form.rules} onChange={(e) => updateForm('rules', e.target.value)} required />
        </div>
        <p className="ap-card-title">Top-three prizes</p>
        <div className="ap-three-col">
          {form.prizes.map((prize, index) => (
            <div className="ap-card" key={`prize-${index}`}>
              <strong>{index + 1}{index === 0 ? 'st' : index === 1 ? 'nd' : 'rd'} place</strong>
              <div className="ap-field">
                <label className="ap-label" htmlFor={`prize-description-${index}`}>Prize description</label>
                <input id={`prize-description-${index}`} className="ap-input" value={prize.description} onChange={(e) => updatePrize(index, 'description', e.target.value)} required />
              </div>
              <div className="ap-field">
                <label className="ap-label" htmlFor={`prize-value-${index}`}>Prize value (KES)</label>
                <input id={`prize-value-${index}`} className="ap-input" type="number" min="0" step="0.01" value={prize.value} onChange={(e) => updatePrize(index, 'value', e.target.value)} required />
              </div>
            </div>
          ))}
        </div>
        <div className="ap-btn-row">
          <button className="ap-btn" type="submit" disabled={saving}>{saving ? 'Saving...' : form.id ? 'Save Event' : 'Create Free Event'}</button>
          {form.id && <button className="ap-btn ap-btn-ghost" type="button" onClick={() => setForm(blankForm())}>Cancel Edit</button>}
        </div>
      </form>

      <div className="ap-card">
        <p className="ap-card-title">Managed Events ({events.length})</p>
        {loading ? <div className="ap-empty">Loading sponsored events...</div> : events.length === 0 ? (
          <div className="ap-empty">No sponsored events yet.</div>
        ) : events.map((event) => (
          <div key={event.id} className="ap-card" style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <strong>{event.name}</strong>
                <div className="ap-muted">{event.sponsorName} · {event.status} · {event.participants} participants · {event.raceCompletions} qualifying race attempts</div>
                <div className="ap-muted">Funding: KES {event.fundingReceived.toLocaleString()} received / KES {event.fundingPledged.toLocaleString()} pledged</div>
              </div>
              <div className="ap-btn-row">
                <button className="ap-btn ap-btn-sm" type="button" onClick={() => editEvent(event)}>Edit</button>
                <button className="ap-btn ap-btn-ghost ap-btn-sm" type="button" onClick={() => loadReport(event)}>Report & Disputes</button>
                <button className="ap-btn ap-btn-ghost ap-btn-sm" type="button" onClick={() => refreshStandings(event)}>Refresh Podium</button>
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              {event.prizes.map((prize) => (
                <div key={prize.place} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid var(--ap-border)', flexWrap: 'wrap' }}>
                  <strong>{prize.place}.</strong>
                  <span>{prize.winnerUsername || 'No winner yet'}</span>
                  <span className="ap-muted">{prize.description} · KES {Number(prize.value).toLocaleString()}</span>
                  <span className="ap-status-badge">{prize.status}</span>
                  {prize.status === 'pending' && <button className="ap-btn ap-btn-sm" type="button" onClick={() => updatePrizeStatus(event, prize, 'under_review')}>Review</button>}
                  {prize.status === 'under_review' && <button className="ap-btn ap-btn-sm" type="button" onClick={() => updatePrizeStatus(event, prize, 'approved')}>Approve</button>}
                  {prize.status === 'approved' && <button className="ap-btn ap-btn-sm" type="button" onClick={() => updatePrizeStatus(event, prize, 'paid')}>Mark Paid</button>}
                  {prize.status === 'disputed' && <button className="ap-btn ap-btn-sm" type="button" onClick={() => updatePrizeStatus(event, prize, 'under_review')}>Return to Review</button>}
                </div>
              ))}
            </div>
            {report?.eventId === event.id && (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--ap-border)' }}>
                <p className="ap-card-title">Aggregate Sponsor Report</p>
                <div className="ap-three-col">
                  {[
                    ['Unique participants', report.uniqueParticipants],
                    ['Race attempts', report.raceAttempts],
                    ['Completed races', report.completedRaces],
                    ['Event-page views', report.eventPageViews],
                    ['Results views', report.resultsViews],
                    ['Sponsor impressions', report.sponsorImpressions],
                    ['Average races / participant', report.averageRacesPerParticipant],
                  ].map(([label, value]) => <div className="ap-card" key={label}><span className="ap-muted">{label}</span><strong style={{ display: 'block', marginTop: 6 }}>{value}</strong></div>)}
                </div>
                <p className="ap-muted">This sponsor report contains aggregate counts only, never player-level personal information.</p>
                <p className="ap-card-title">Result disputes</p>
                {disputes.length === 0 ? <div className="ap-empty">No disputes submitted.</div> : disputes.map((dispute) => (
                  <div key={dispute.id} style={{ padding: 10, borderTop: '1px solid var(--ap-border)' }}>
                    <strong>{dispute.username}</strong> · {dispute.status}
                    <p>{dispute.message}</p>
                    {dispute.status === 'open' && <div className="ap-btn-row">
                      <button className="ap-btn ap-btn-sm" type="button" onClick={() => resolveDispute(event, dispute, 'resolved')}>Resolve</button>
                      <button className="ap-btn ap-btn-ghost ap-btn-sm" type="button" onClick={() => resolveDispute(event, dispute, 'rejected')}>Reject</button>
                    </div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
