export async function runDeletionBatch(records, remove, { stopped = () => false, progress = () => {} } = {}) {
  const results = []
  let interrupted = false
  for (const record of records) {
    if (interrupted || stopped()) { results.push({ ...record, status: 'pending', message: 'No se intentó: lote detenido.' }); continue }
    try {
      await remove(record.id, { suppressDeleteAlert: true })
      results.push({ ...record, status: 'success', message: 'Eliminación confirmada por el servidor.' })
    } catch (error) {
      const status = Number(error?.status || error?.response?.status)
      const uncertain = !status || status >= 500 || status === 408
      results.push({ ...record, status: uncertain ? 'unknown' : 'failed', message: uncertain ? 'No se pudo confirmar el resultado. Actualiza y verifica este registro antes de reintentar.' : error?.message || 'No se pudo eliminar este registro.' })
      if (uncertain || [401,403,429].includes(status)) interrupted = true
    }
    progress([...results])
  }
  return results
}
