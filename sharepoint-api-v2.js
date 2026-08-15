/**
 * sharepoint-api.js (v2)
 * -------------------------------------------------------------------------
 * Substitui a camada de dados que antes chamava o Azure Functions (/api/...)
 * por chamadas diretas ao SharePoint REST API nativo — sem App Registration,
 * autenticado pela sessão do usuário já logado no navegador.
 *
 * Este arquivo expõe window.SharePointAdapter, um objeto com a MESMA
 * assinatura que o chcData original do index.html usava
 * (listBases, listAircraft, listFlights, createFlight, updateFlight,
 * deleteFlight), então a troca no index.html é de uma linha só.
 *
 * REQUISITO: precisa rodar hospedado no mesmo domínio do SharePoint
 * (ex: numa Document Library do próprio site), senão o navegador bloqueia
 * por CORS.
 *
 * PREMISSAS A CONFIRMAR (ver comentário "ASSUMIR/CONFIRMAR" abaixo):
 *  - BASE_ORIGEM aponta para CHC_BASES, UNIDADE_DESTINO aponta para
 *    CHC_PLATAFORMAS (o nome das listas sugere isso, mas vale confirmar
 *    abrindo a coluna em "List settings" e olhando "Get information about
 *    the source list").
 *  - Não existe coluna de "Cliente" na lista CHC_VOOS — por ora o cliente
 *    é gravado dentro de OBSERVACOES, prefixado com "Cliente: ".
 *  - Os valores de STATUS_VOO (Choice) usados pelo app (ex: "EM
 *    PREPARAÇÃO", "FINALIZADO") precisam existir como opções válidas na
 *    coluna Choice do SharePoint, senão a gravação falha.
 * -------------------------------------------------------------------------
 */

const SP_SITE = "https://helione.sharepoint.com/sites/chc2028transformationoffice";

const LISTS = {
  voos: "CHC_VOOS",
  aeronaves: "CHC_AERONAVES",
  tripulacao: "CHC_TRIPULACAO2",
  plataformas: "CHC_PLATAFORMAS",
  bases: "CHC_BASES",
};

/* -------------------------------------------------------------------------
 * Helpers baixo nível (REST API)
 * ---------------------------------------------------------------------- */

async function getRequestDigest() {
  const res = await fetch(`${SP_SITE}/_api/contextinfo`, {
    method: "POST",
    headers: { Accept: "application/json;odata=verbose" },
    credentials: "same-origin",
  });
  if (!res.ok) throw new Error(`Falha ao obter request digest (${res.status})`);
  const data = await res.json();
  return data.d.GetContextWebInformation.FormDigestValue;
}

function buildUrl(listName, options = {}) {
  let url = `${SP_SITE}/_api/web/lists/getbytitle('${listName}')/items`;
  const params = [];
  if (options.select) params.push(`$select=${options.select}`);
  if (options.expand) params.push(`$expand=${options.expand}`);
  if (options.filter) params.push(`$filter=${encodeURIComponent(options.filter)}`);
  if (options.orderby) params.push(`$orderby=${options.orderby}`);
  if (options.top) params.push(`$top=${options.top}`);
  if (params.length) url += `?${params.join("&")}`;
  return url;
}

async function spGetItems(listName, options = {}) {
  const url = buildUrl(listName, options);
  const res = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json;odata=verbose" },
    credentials: "same-origin",
  });
  if (!res.ok) throw new Error(`Erro ao buscar "${listName}": ${res.status} ${res.statusText}`);
  const data = await res.json();
  return data.d.results;
}

const _entityTypeCache = {};
async function getListItemEntityType(listName) {
  if (_entityTypeCache[listName]) return _entityTypeCache[listName];
  const res = await fetch(
    `${SP_SITE}/_api/web/lists/getbytitle('${listName}')?$select=ListItemEntityTypeFullName`,
    { method: "GET", headers: { Accept: "application/json;odata=verbose" }, credentials: "same-origin" }
  );
  if (!res.ok) throw new Error(`Falha ao obter entity type de "${listName}"`);
  const data = await res.json();
  const type = data.d.ListItemEntityTypeFullName;
  _entityTypeCache[listName] = type;
  return type;
}

async function spCreateItem(listName, fields) {
  const digest = await getRequestDigest();
  const body = { __metadata: { type: await getListItemEntityType(listName) }, ...fields };
  const res = await fetch(`${SP_SITE}/_api/web/lists/getbytitle('${listName}')/items`, {
    method: "POST",
    headers: {
      Accept: "application/json;odata=verbose",
      "Content-Type": "application/json;odata=verbose",
      "X-RequestDigest": digest,
    },
    credentials: "same-origin",
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Erro ao criar item em "${listName}": ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.d;
}

async function spUpdateItem(listName, itemId, fields) {
  const digest = await getRequestDigest();
  const entityType = await getListItemEntityType(listName);
  const body = { __metadata: { type: entityType }, ...fields };
  const res = await fetch(`${SP_SITE}/_api/web/lists/getbytitle('${listName}')/items(${itemId})`, {
    method: "POST",
    headers: {
      Accept: "application/json;odata=verbose",
      "Content-Type": "application/json;odata=verbose",
      "X-RequestDigest": digest,
      "X-HTTP-Method": "MERGE",
      "IF-MATCH": "*",
    },
    credentials: "same-origin",
    body: JSON.stringify(body),
  });
  if (!res.ok && res.status !== 204) {
    throw new Error(`Erro ao atualizar item ${itemId} em "${listName}": ${res.status} ${await res.text()}`);
  }
  return true;
}

async function spDeleteItem(listName, itemId) {
  const digest = await getRequestDigest();
  const res = await fetch(`${SP_SITE}/_api/web/lists/getbytitle('${listName}')/items(${itemId})`, {
    method: "POST",
    headers: { "X-RequestDigest": digest, "X-HTTP-Method": "DELETE", "IF-MATCH": "*" },
    credentials: "same-origin",
  });
  if (!res.ok && res.status !== 204) {
    throw new Error(`Erro ao excluir item ${itemId} em "${listName}": ${res.status} ${await res.text()}`);
  }
  return true;
}

/* -------------------------------------------------------------------------
 * Cache de listas de apoio (aeronaves, bases, plataformas, tripulação)
 * usado tanto para preencher os dropdowns quanto para resolver os IDs
 * exigidos pelos campos Lookup.
 * ---------------------------------------------------------------------- */

let _cache = { aeronaves: null, bases: null, plataformas: null, tripulacao: null };

async function loadSupportLists(force = false) {
  if (!force && _cache.aeronaves) return _cache;
  const [aeronaves, bases, plataformas, tripulacao] = await Promise.all([
    spGetItems(LISTS.aeronaves, { select: "Id,Title,Modelo", orderby: "Title asc" }),
    spGetItems(LISTS.bases, { select: "Id,Title,ICAO", orderby: "Title asc" }),
    spGetItems(LISTS.plataformas, { select: "Id,Title", orderby: "Title asc" }),
    spGetItems(LISTS.tripulacao, { select: "Id,Title,Funcao", orderby: "Title asc" }),
  ]);
  _cache = { aeronaves, bases, plataformas, tripulacao };
  return _cache;
}

function findIdByTitle(items, title) {
  if (!title) return null;
  const hit = items.find((i) => (i.Title || "").trim().toLowerCase() === String(title).trim().toLowerCase());
  return hit ? hit.Id : null;
}

/* -------------------------------------------------------------------------
 * Mapeamento entre o modelo de dados do app (flight) e as colunas do
 * SharePoint (CHC_VOOS).
 * ---------------------------------------------------------------------- */

function flightFromSPItem(item) {
  let logVoo = {}, pesos = {};
  try { logVoo = item.OBSERVACOES ? JSON.parse(item.OBSERVACOES).logVoo || {} : {}; } catch (e) {}
  return {
    id: item.Id,
    reg: item.AERONAVE ? item.AERONAVE.Title : "",
    model: item.AERONAVE ? item.AERONAVE.Modelo : "",
    flightNo: item.Title || "",
    base: item.BASE_ORIGEM ? item.BASE_ORIGEM.Title : "",
    unidade: item.UNIDADE_DESTINO ? item.UNIDADE_DESTINO.Title : "",
    horario: item.HORARIO_PREVISTO ? new Date(item.HORARIO_PREVISTO).toISOString().slice(11, 16) : "--:--",
    cp: item.PILOTO ? item.PILOTO.Title : "",
    fo: item.COPILOTO ? item.COPILOTO.Title : "",
    fa: item.COMISSARIO ? item.COMISSARIO.Title : "",
    destino: item.ROTA || "",
    status: item.STATUS_VOO || "EM PREPARAÇÃO",
    criadoEm: item.Created || null,
    finalizadoEm: item.DATA_HORA_FINALIZACAO || null,
    pesos: {
      passageiro: item.PES0_PAX ?? "",
      bagagem: item.PESO_BAGAGEM ?? "",
      carga: item.PESO_CARGA ?? "",
      tripulacao: item.PESO_TRIPULACAO ?? "",
      combustivelMinimo: item.COMBUSTIVEL_MINIMO ?? "",
      combustivelTotal: item.COMBUTIVEL_TOTAL ?? "",
      totalCarga: undefined,
      totalVoo: item.PESO_TOTAL ?? "",
    },
    logVoo: {
      ida: {
        acionamento: item.HORARIO_REAL_ACIONAMENTO ? new Date(item.HORARIO_REAL_ACIONAMENTO).toISOString().slice(11, 16) : "",
        decolagem: item.DECOLAGEM_IDA ? new Date(item.DECOLAGEM_IDA).toISOString().slice(11, 16) : "",
        pousoUnidade: item.POUSO_UNIDADE_IDA ?? "",
        altitude: item.ALTITUDE_IDA ?? "",
        combustivelMomento: item.COMBUSTIVEL_MOMENTO ?? "",
      },
      volta: {
        decolagem: item.DECOLAGEM_VOLTA ? new Date(item.DECOLAGEM_VOLTA).toISOString().slice(11, 16) : "",
        estimadoPouso: item.ESTIMADO_POUSO_VOLTA ? new Date(item.ESTIMADO_POUSO_VOLTA).toISOString().slice(11, 16) : "",
        corte: item.CORTE_VOLTA ? new Date(item.CORTE_VOLTA).toISOString().slice(11, 16) : "",
        pax: item.PAX_VOLTA ?? "",
        combustivelMomento: item.COMBUSTIVEL_DO_MOMENTO ?? "",
      },
    },
  };
}

// Combina a data de hoje com um "HH:MM" para virar um DateTime ISO completo,
// já que as colunas de horário no SharePoint são "Date and Time".
function timeToISO(hhmm, baseDate = new Date()) {
  if (!hhmm || hhmm === "--:--") return null;
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(baseDate);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

async function flightToSPFields(flight) {
  const { aeronaves, bases, plataformas, tripulacao } = await loadSupportLists();

  const aeronaveId = findIdByTitle(aeronaves, flight.reg);
  const baseId = findIdByTitle(bases, flight.base);
  const unidadeId = findIdByTitle(plataformas, flight.unidade);
  const pilotoId = findIdByTitle(tripulacao, flight.cp);
  const copilotoId = findIdByTitle(tripulacao, flight.fo);
  const comissarioId = findIdByTitle(tripulacao, flight.fa);

  const fields = {
    Title: flight.flightNo || "",
    ROTA: flight.destino || "",
    STATUS_VOO: flight.status || "EM PREPARAÇÃO",
    HORARIO_PREVISTO: timeToISO(flight.horario),
    OBSERVACOES: JSON.stringify({ cliente: flight.cliente || "—", logVoo: flight.logVoo || {} }),
  };

  if (aeronaveId) fields.AERONAVEId = aeronaveId;
  if (baseId) fields.BASE_ORIGEMId = baseId; // ASSUMIR/CONFIRMAR: lookup para CHC_BASES
  if (unidadeId) fields.UNIDADE_DESTINOId = unidadeId; // ASSUMIR/CONFIRMAR: lookup para CHC_PLATAFORMAS
  if (pilotoId) fields.PILOTOId = pilotoId;
  if (copilotoId) fields.COPILOTOId = copilotoId;
  if (comissarioId) fields.COMISSARIOId = comissarioId;

  if (flight.pesos) {
    const w = flight.pesos;
    if (w.passageiro !== undefined) fields.PES0_PAX = String(w.passageiro);
    if (w.bagagem !== undefined) fields.PESO_BAGAGEM = Number(w.bagagem) || 0;
    if (w.carga !== undefined) fields.PESO_CARGA = Number(w.carga) || 0;
    if (w.tripulacao !== undefined) fields.PESO_TRIPULACAO = Number(w.tripulacao) || 0;
    if (w.combustivelMinimo !== undefined) fields.COMBUSTIVEL_MINIMO = Number(w.combustivelMinimo) || 0;
    if (w.combustivelTotal !== undefined) fields.COMBUTIVEL_TOTAL = Number(w.combustivelTotal) || 0;
    if (w.totalVoo !== undefined) fields.PESO_TOTAL = Number(w.totalVoo) || 0;
  }

  if (flight.logVoo) {
    const ida = flight.logVoo.ida || {}, volta = flight.logVoo.volta || {};
    if (ida.acionamento) fields.HORARIO_REAL_ACIONAMENTO = timeToISO(ida.acionamento);
    if (ida.decolagem) fields.DECOLAGEM_IDA = timeToISO(ida.decolagem);
    if (ida.pousoUnidade) fields.POUSO_UNIDADE_IDA = Number(ida.pousoUnidade) || 0;
    if (ida.altitude) fields.ALTITUDE_IDA = Number(ida.altitude) || 0;
    if (ida.combustivelMomento) fields.COMBUSTIVEL_MOMENTO = Number(ida.combustivelMomento) || 0;
    if (volta.decolagem) fields.DECOLAGEM_VOLTA = timeToISO(volta.decolagem);
    if (volta.estimadoPouso) fields.ESTIMADO_POUSO_VOLTA = timeToISO(volta.estimadoPouso);
    if (volta.corte) fields.CORTE_VOLTA = timeToISO(volta.corte);
    if (volta.pax !== undefined && volta.pax !== "") fields.PAX_VOLTA = Number(volta.pax) || 0;
    if (volta.combustivelMomento) fields.COMBUSTIVEL_DO_MOMENTO = Number(volta.combustivelMomento) || 0;
  }

  if (flight.status === "FINALIZADO") {
    fields.DATA_HORA_FINALIZACAO = new Date().toISOString();
  }

  return fields;
}

/* -------------------------------------------------------------------------
 * Interface pública — mesma assinatura do chcData original
 * ---------------------------------------------------------------------- */

window.SharePointAdapter = {
  async listBases() {
    const { bases } = await loadSupportLists();
    return bases.map((b) => b.Title);
  },

  async listAircraft() {
    const { aeronaves } = await loadSupportLists();
    return aeronaves.map((a) => ({ tail: a.Title, model: a.Modelo || "Aeronave CHC" }));
  },

  async listFlights(base) {
    await loadSupportLists(); // garante que os nomes já estejam resolvidos
    const options = {
      expand: "AERONAVE,BASE_ORIGEM,UNIDADE_DESTINO,PILOTO,COPILOTO,COMISSARIO",
      select: "*,AERONAVE/Title,AERONAVE/Modelo,BASE_ORIGEM/Title,UNIDADE_DESTINO/Title,PILOTO/Title,COPILOTO/Title,COMISSARIO/Title",
      orderby: "Created desc",
    };
    const items = await spGetItems(LISTS.voos, options);
    const flights = items.map(flightFromSPItem);
    return base ? flights.filter((f) => f.base === base) : flights;
  },

  async createFlight(base, flight) {
    const fields = await flightToSPFields({ ...flight, base });
    const created = await spCreateItem(LISTS.voos, fields);
    return flightFromSPItem({ ...created, ...fields });
  },

  async updateFlight(base, original, flight) {
    const id = original?.id || flight.id;
    if (!id) return null;
    try {
      const fields = await flightToSPFields({ ...flight, base });
      await spUpdateItem(LISTS.voos, id, fields);
      return { ...flight, id, base };
    } catch (e) {
      console.error("updateFlight falhou:", e);
      return null;
    }
  },

  async deleteFlight(base, original) {
    const id = original?.id;
    if (!id) return false;
    try {
      await spDeleteItem(LISTS.voos, id);
      return true;
    } catch (e) {
      console.error("deleteFlight falhou:", e);
      return false;
    }
  },

  /* --- Sessão de login continua 100% local (não é dado compartilhado) --- */
  loadSession() {
    try { return JSON.parse(localStorage.getItem("chc:session") || "null") || { name: "", base: "", aircraft: [] }; }
    catch (e) { return { name: "", base: "", aircraft: [] }; }
  },
  saveSession(session) { localStorage.setItem("chc:session", JSON.stringify(session)); },
  clearSession() { localStorage.removeItem("chc:session"); },
};
