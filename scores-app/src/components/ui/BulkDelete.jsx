import { useEffect, useRef, useState } from 'react'
import ActionDialog from '../common/ActionDialog'
import { runDeletionBatch } from '../../utils/bulkActions'

const states = { success:'Eliminado', failed:'No eliminado', pending:'Sin procesar', unknown:'Por verificar' }
export default function BulkDelete({ records, remove, onComplete, warning, label = r => r.nombre || `#${r.id}`, disabled = false }) {
  const [selected,setSelected]=useState([]), [preview,setPreview]=useState(null), [confirmation,setConfirmation]=useState('')
  const [busy,setBusy]=useState(false), [result,setResult]=useState(null), [error,setError]=useState(''), [stopRequested,setStopRequested]=useState(false)
  const stopped=useRef(false), running=useRef(false), mounted=useRef(true)
  useEffect(()=>{ mounted.current=true; return ()=>{mounted.current=false;stopped.current=true} },[])
  useEffect(()=>{
    if(!busy) return
    const prevent=e=>{e.preventDefault();e.returnValue=''}
    window.addEventListener('beforeunload',prevent)
    return ()=>window.removeEventListener('beforeunload',prevent)
  },[busy])
  const visible=records.filter(r=>selected.includes(String(r.id)))
  const hidden=selected.length-visible.length
  const review=()=>{
    if(disabled || running.current || !visible.length) return
    setPreview(visible.map(r=>({id:r.id,name:label(r),partidos:r.partidos_count,inscripciones:r.inscripciones_count})))
    setConfirmation('');setError('')
  }
  const run=async()=>{
    if(running.current || disabled || confirmation!=='ELIMINAR' || !preview?.length) return
    if(preview.some(r=>!visible.some(v=>String(v.id)===String(r.id)))) {setError('La lista cambió. Cierra la vista previa y revisa la selección.');return}
    running.current=true;stopped.current=false;setBusy(true);setStopRequested(false);setResult(null);setError('')
    const snapshot=preview
    try {
      const rows=await runDeletionBatch(snapshot,remove,{stopped:()=>stopped.current,progress:r=>{if(mounted.current)setResult(r)}})
      if(!mounted.current) return
      setResult(rows);setPreview(null)
      const completed=new Set(rows.filter(r=>r.status==='success' || r.status==='unknown').map(r=>String(r.id)))
      setSelected(old=>old.filter(id=>!completed.has(id)))
      try { await onComplete?.() } catch { if(mounted.current)setError('El lote terminó, pero no se pudo actualizar la lista. Los resultados se conservan; actualiza antes de reintentar.') }
    } finally { running.current=false;if(mounted.current)setBusy(false) }
  }
  return <details className='card p-4 space-y-3'>
    <summary className='cursor-pointer font-semibold text-sm'>Selección múltiple · {visible.length} seleccionados</summary>
    <p className='text-xs text-[var(--text-muted)]'>Se eliminarán solo los seleccionados visibles. Si alguno falla, los demás pueden eliminarse.</p>
    {hidden>0 && <p className='text-xs'>{hidden} seleccionados fuera de estos filtros no se incluirán.</p>}
    <div className='flex flex-wrap gap-2'>
      <button type='button' className='btn-secondary text-xs px-3 py-2' disabled={busy||disabled} onClick={()=>setSelected(old=>[...new Set([...old,...records.map(r=>String(r.id))])])}>Seleccionar visibles ({records.length})</button>
      <button type='button' className='btn-ghost text-xs px-3 py-2' disabled={busy} onClick={()=>setSelected([])}>Limpiar selección</button>
    </div>
    <div className='max-h-60 overflow-y-auto space-y-1'>{records.map(r=><label key={r.id} className='flex gap-3 items-center min-h-11 text-sm rounded-xl px-2 hover:bg-[var(--bg-secondary)]'>
      <input type='checkbox' className='w-5 h-5 shrink-0 accent-green-700' disabled={busy||disabled} checked={selected.includes(String(r.id))} onChange={e=>setSelected(old=>e.target.checked?[...new Set([...old,String(r.id)])]:old.filter(id=>id!==String(r.id)))} />
      <span className='break-words min-w-0'>{label(r)} <small className='text-[var(--text-muted)]'>#{r.id}</small></span>
    </label>)}</div>
    <button type='button' className='btn-secondary text-red-600 px-4 py-3 w-full sm:w-auto' disabled={busy||disabled||!visible.length} onClick={review}>Revisar eliminación ({visible.length})</button>
    {error && <p role='alert' className='text-sm text-red-600'>{error}</p>}
    {preview && <ActionDialog title='Vista previa de eliminación' busy={busy} onClose={()=>setPreview(null)}>
      <p className='text-sm font-semibold'>{warning}</p>
      <p className='text-sm'>{preview.length} registros seleccionados para eliminar.</p>
      <ol className='max-h-48 overflow-auto space-y-2'>{preview.map(r=><li key={r.id} className='rounded-xl bg-[var(--bg-hover)] p-3 text-sm break-words'><strong>{r.name}</strong> · #{r.id}{r.partidos!=null && <p className='text-xs mt-1'>{r.partidos} partidos · {r.inscripciones || 0} inscripciones (según el último listado).</p>}</li>)}</ol>
      {busy ? <div role='status' className='space-y-3'><p>{result?.length || 0} de {preview.length} procesados. Mantén esta página abierta.</p><progress className='w-full' max={preview.length} value={result?.length || 0} aria-label='Progreso del lote' /><button className='btn-secondary px-3 py-2' disabled={stopRequested} onClick={()=>{stopped.current=true;setStopRequested(true)}}>{stopRequested?'Deteniendo tras la solicitud actual…':'Detener pendientes'}</button></div> : <>
        <label className='block text-sm'>Escribe ELIMINAR para confirmar<input aria-label='Confirmar eliminación múltiple' className='form-input w-full mt-2' autoComplete='off' value={confirmation} onChange={e=>setConfirmation(e.target.value)} /></label>
        {error && <p role='alert' className='text-red-600 text-sm'>{error}</p>}
        <div className='flex flex-wrap gap-2 justify-end'><button className='btn-secondary px-4 py-2' onClick={()=>setPreview(null)}>Volver</button><button className='btn-primary px-4 py-2' disabled={confirmation!=='ELIMINAR'||disabled} onClick={run}>Eliminar {preview.length} registros</button></div>
      </>}
    </ActionDialog>}
    {result && !busy && <section aria-label='Resultado del lote' className='space-y-3 border-t border-[var(--border-color)] pt-3'>
      <p role='status' className='text-sm font-semibold'>{result.filter(r=>r.status==='success').length} eliminados · {result.filter(r=>r.status==='failed').length} no eliminados · {result.filter(r=>r.status==='unknown').length} por verificar · {result.filter(r=>r.status==='pending').length} sin procesar</p>
      <p className='text-xs'>Los fallidos y pendientes conservan su selección. Los de resultado incierto se desmarcan para evitar repetirlos sin revisión.</p>
      <ul className='max-h-72 overflow-y-auto space-y-2'>{result.map(r=><li key={r.id} className='text-sm p-3 rounded-xl bg-[var(--bg-hover)] break-words'><strong>{states[r.status]} · {r.name} (#{r.id})</strong><p className='text-xs mt-1'>{r.message}</p></li>)}</ul>
    </section>}
  </details>
}
