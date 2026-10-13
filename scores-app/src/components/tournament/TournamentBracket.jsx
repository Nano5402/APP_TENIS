import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Trophy, ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react'
import { buildBracket, bracketSlot, categoryKey } from '../../utils/tournamentBracket'
import { getParticipantName } from '../../utils/matchParticipants'
import { formatDate, formatClockTime } from '../../utils/formatDate'

export default function TournamentBracket({ matches, system, management = false }) {
  const [category, setCategory] = useState(''), [roundKey, setRoundKey] = useState('')
  const categories = useMemo(() => [...new Map(matches.map(m=>[categoryKey(m),m.categoria?.nombre || 'Sin categoría asignada'])).entries()].sort((a,b)=>a[1].localeCompare(b[1],'es',{numeric:true})), [matches])
  const selected = categories.some(([id])=>id===category) ? category : categories[0]?.[0]
  const bracket = useMemo(()=>buildBracket(matches,system,selected),[matches,system,selected])
  const { rounds } = bracket
  const current = Math.max(0,rounds.findIndex(r=>r.key===roundKey))
  function matchCard(match) {
    const targets = matches.filter(m=>categoryKey(m)===selected && [1,2].some(side=>bracketSlot(m,side,bracket).source===Number(match.id)))
    const final = match.estado==='finalizado', canceled=match.estado==='cancelado'
    return <article key={match.id} className='rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] shadow-sm overflow-hidden min-w-0'>
      <div className='px-3 py-2 flex flex-wrap justify-between gap-2 text-xs bg-[var(--bg-hover)]'><span className='font-bold'>Partido #{match.id}</span><span>{final ? 'Finalizado' : canceled ? 'Cancelado' : match.estado==='en_vivo' ? match.en_vivo?.pausado_at ? 'En pausa' : 'En vivo' : 'Programado'}</span></div>
      <div className='p-3 space-y-2'>{[1,2].map(side=>{
        const slot=bracketSlot(match,side,bracket)
        const won=final && match.ganador===`jugador${side}`
        return <div key={side} className={`rounded-xl px-2 py-2 ${won?'bg-green-500/10':''}`}>
          <div className='flex items-start gap-2'><div className='min-w-0 flex-1'><p className={`text-sm break-words ${won?'text-green-600 font-bold':'font-medium'}`}>{slot.pending ? slot.source ? `Ganador del partido #${slot.source}` : 'Participante por confirmar' : getParticipantName(match,side)}</p>
            {won && <span className='text-[11px] font-semibold text-green-600'>Ganador</span>}
            {match.retiros?.[`jugador${side}`] && <p className='text-xs text-[var(--text-secondary)]'>Retirado del torneo</p>}
            {slot.invalid && <p className='text-[11px] text-[var(--text-secondary)]'>Cruce pendiente de revisión</p>}
            {slot.source && <Link to={`/match/${slot.source}`} className='text-[11px] underline text-[var(--text-secondary)]'>{slot.pending?'Ver cruce de origen':'Clasificó desde'} #{slot.source}</Link>}
          </div><div className='flex flex-wrap justify-end gap-2 max-w-[42%]' aria-label={`Parciales de participante ${side}`}>
            {(match.sets || []).map(s=><span key={s.numero_set} className='text-center'><small className='block text-[9px] text-[var(--text-muted)]'>S{s.numero_set}</small><strong className={won?'text-green-600':''}>{s[`games_j${side}`]}</strong>{s[`tiebreak_j${side}`]!=null && <sup className='text-[9px]'>{s[`tiebreak_j${side}`]}</sup>}</span>)}
          </div></div>
        </div>
      })}</div>
      <div className='px-3 pb-3 text-xs text-[var(--text-secondary)] space-y-2'>
        <p>{match.fecha_inicio ? formatDate(match.fecha_inicio) : 'Fecha por definir'} · {match.hora_inicio ? formatClockTime(match.hora_inicio) : 'Hora por definir'}<br />{match.cancha?.nombre || 'Cancha por asignar'}</p>
        {final && !match.ganador && <p>Sin ganador registrado · clasificación por confirmar</p>}
        <Link to={`/match/${match.id}`} className='inline-flex items-center gap-1 text-[var(--color-brand)] font-semibold py-1'>Ver partido <ArrowRight size={14}/></Link>
        {targets.length>0 && <p className='border-t border-[var(--border-color)] pt-2'>Cruce siguiente: {targets.map((m,i)=><span key={m.id}>{i>0?' · ':''}<Link className='underline' to={`/match/${m.id}`}>#{m.id}</Link></span>)}</p>}
      </div>
    </article>
  }
  return <section className='space-y-4 min-w-0' aria-label='Cuadro de eliminatorias'>
    <header className='card p-4 sm:p-5 space-y-3'><h2 className='font-bold flex items-center gap-2'><Trophy size={20}/>Camino a la final</h2><p className='text-sm text-[var(--text-secondary)]'>Cruces registrados por la organización. No se generan clasificados ni pases libres automáticamente.</p>
      <label className='block text-sm font-semibold'>Categoría<select aria-label='Categoría del cuadro' className='form-input w-full mt-1' value={selected || ''} onChange={e=>{setCategory(e.target.value);setRoundKey('')}}>{categories.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>
    </header>
    {management && bracket.issues.length>0 && <details className='card p-4 text-sm'><summary className='font-semibold cursor-pointer'>Revisar {bracket.issues.length} referencias del cuadro</summary><ul className='mt-2 space-y-1'>{bracket.issues.map((issue,i)=><li key={i}>{issue}</li>)}</ul></details>}
    {!rounds.length ? <p className='card p-6 text-sm'>Todavía no hay partidos de eliminatoria registrados para esta categoría.</p> : <>
      <div className='lg:hidden flex items-center gap-2'>
        <button aria-label='Ronda anterior' className='btn-secondary p-3' disabled={current===0} onClick={()=>setRoundKey(rounds[current-1].key)}><ChevronLeft size={18}/></button>
        <label className='min-w-0 flex-1'><span className='sr-only'>Ronda</span><select aria-label='Ronda del cuadro' className='form-input w-full' value={rounds[current].key} onChange={e=>setRoundKey(e.target.value)}>{rounds.map(r=><option key={r.key} value={r.key}>{r.label}</option>)}</select></label>
        <button aria-label='Ronda siguiente' className='btn-secondary p-3' disabled={current===rounds.length-1} onClick={()=>setRoundKey(rounds[current+1].key)}><ChevronRight size={18}/></button>
      </div>
      <div className='grid gap-3 lg:hidden'>{rounds[current].matches.map(matchCard)}</div>
      <div className='hidden lg:flex gap-5 overflow-x-auto pb-4' role='region' aria-label='Rondas de eliminatoria' tabIndex={0}>{rounds.map(r=><section key={r.key} className='w-72 shrink-0 space-y-3'><h3 className='text-sm font-bold rounded-xl bg-[var(--bg-hover)] p-3'>{r.label} · {r.matches.length}</h3>{r.matches.map(matchCard)}</section>)}</div>
      <p className='text-xs text-[var(--text-muted)]'>Un lugar por confirmar no significa una exención de primera ronda. Las rondas sin nombre se conservan aparte; no se deducen a partir del número de partidos.</p>
    </>}
  </section>
}
