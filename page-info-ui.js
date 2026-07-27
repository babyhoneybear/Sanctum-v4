(() => {
	const VIEW_STATE_KEY = "sanctum_knowledge_view_state";
	const SYSTEM_PAGE_IDS = new Set(["home", "search", "inbox", "notes"]);
	const PROPERTY_TYPES = [
		{ value: "text", label: "Text" },
		{ value: "number", label: "Number" },
		{ value: "date", label: "Date" },
		{ value: "select", label: "Select" },
		{ value: "relation", label: "Relation" }
	];

	let viewState = typeof window.readStorageJSON === "function"
		? window.readStorageJSON(VIEW_STATE_KEY, {})
		: {};
	let pendingAnchorJump = null;
	let activeDrawerPageId = "";

	function escapeHTML(text = "") {
		return String(text)
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/\"/g, "&quot;")
			.replace(/'/g, "&#39;");
	}

	function normalizePropertyKey(name = "") {
		return String(name || "")
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "");
	}

	function parsePropertyOptions(rawValue = "") {
		if (Array.isArray(rawValue)) {
			return rawValue.map((item) => String(item || "").trim()).filter(Boolean);
		}

		return String(rawValue || "")
			.split(",")
			.map((item) => item.trim())
			.filter(Boolean);
	}

	function normalizeAliasList(rawValue = "") {
		if (typeof window.normalizeVaultAliases === "function") {
			return window.normalizeVaultAliases(rawValue);
		}
		return parsePropertyOptions(rawValue);
	}

	function createPropertyId() {
		return `prop-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
	}

	function normalizeKnowledgeProperty(prop = {}) {
		const allowedTypes = new Set(PROPERTY_TYPES.map((item) => item.value));
		const type = allowedTypes.has(prop.type) ? prop.type : "text";
		return {
			id: typeof prop.id === "string" && prop.id ? prop.id : createPropertyId(),
			name: typeof prop.name === "string" ? prop.name : "",
			type,
			value: type === "number"
				? String(prop.value ?? "")
				: (typeof prop.value === "string" ? prop.value : String(prop.value ?? "")),
			options: parsePropertyOptions(prop.options),
			relationPageId: typeof prop.relationPageId === "string" ? prop.relationPageId : "",
			relationAnchorId: typeof prop.relationAnchorId === "string" ? prop.relationAnchorId : ""
		};
	}

	function getAllRecords() {
		const domains = Array.isArray(window.userDomains) ? window.userDomains : [];
		const pages = Array.isArray(window.userPages) ? window.userPages : [];
		return [...domains, ...pages];
	}

	function getPageRecord(pageId) {
		if (!pageId || SYSTEM_PAGE_IDS.has(pageId)) return null;
		return getAllRecords().find((record) => record.id === pageId) || null;
	}

	function getPageMap() {
		const map = {};
		getAllRecords().forEach((record) => {
			map[record.id] = record;
		});
		return map;
	}

	function getScopedRelationOptions(records, pageId, selectedId = "") {
		const currentScopeId = typeof window.getVaultTopLevelScopeId === "function"
			? window.getVaultTopLevelScopeId(pageId)
			: "";
		const selected = selectedId ? records.find((item) => item.id === selectedId) : null;
		const sorted = [...records].sort((left, right) => {
			if (typeof window.compareVaultScopedRecords === "function") {
				return window.compareVaultScopedRecords(left, right, currentScopeId);
			}
			return String(left.title || "").localeCompare(String(right.title || ""), undefined, { sensitivity: "base", numeric: true });
		});

		if (!currentScopeId || typeof window.isVaultRecordInScope !== "function") {
			return sorted.map((item) => `
				<option value="${escapeHTML(item.id)}"${item.id === selectedId ? " selected" : ""}>${escapeHTML(item.title || "Untitled")}</option>
			`).join("");
		}

		const current = sorted.filter((item) => window.isVaultRecordInScope(item, currentScopeId));
		const outside = sorted.filter((item) => !window.isVaultRecordInScope(item, currentScopeId));
		const scopeLabel = typeof window.getVaultScopeLabel === "function" ? window.getVaultScopeLabel(currentScopeId) : "";
		const renderOptions = (items) => items.map((item) => `
			<option value="${escapeHTML(item.id)}"${item.id === selectedId ? " selected" : ""}>${escapeHTML(item.title || "Untitled")}</option>
		`).join("");
		const groups = [];

		if (current.length) {
			groups.push(`<optgroup label="${escapeHTML(scopeLabel ? `Current area: ${scopeLabel}` : "Current area")}">${renderOptions(current)}</optgroup>`);
		}
		if (outside.length) {
			groups.push(`<optgroup label="Outside current area">${renderOptions(outside)}</optgroup>`);
		}
		if (selected && !current.includes(selected) && !outside.includes(selected)) {
			groups.push(`<optgroup label="Selected">${renderOptions([selected])}</optgroup>`);
		}

		return groups.join("");
	}

	function isDocumentPage(pageId) {
		return !!(Array.isArray(window.userPages) ? window.userPages : []).find(
			(page) => page.id === pageId && page.layout === "document"
		);
	}

	function getCurrentPageId() {
		return typeof window.getCurrentPageId === "function" ? window.getCurrentPageId() : "home";
	}

	function ensureRecordKnowledgeShape(record) {
		if (!record) return false;

		let changed = false;
		const safeProps = Array.isArray(record.knowledgeProperties) ? record.knowledgeProperties : [];
		const normalizedProps = safeProps.map(normalizeKnowledgeProperty);

		if (!Array.isArray(record.knowledgeProperties) || JSON.stringify(safeProps) !== JSON.stringify(normalizedProps)) {
			record.knowledgeProperties = normalizedProps;
			changed = true;
		}

		if (!record.createdAt) {
			record.createdAt = Date.now();
			changed = true;
		}

		if (!record.updatedAt) {
			record.updatedAt = record.createdAt || Date.now();
			changed = true;
		}

		return changed;
	}

	function ensureRegistryKnowledgeShape() {
		let changed = false;
		getAllRecords().forEach((record) => {
			if (ensureRecordKnowledgeShape(record)) changed = true;
		});

		if (changed && typeof window.saveSanctumRegistry === "function") {
			window.saveSanctumRegistry();
		}
	}

	function persistViewState() {
		if (typeof window.writeStorageJSON === "function") {
			window.writeStorageJSON(VIEW_STATE_KEY, viewState);
		}
	}

	function getViewState(pageId) {
		const stored = viewState[pageId] || {};
		return {
			filterKey: "",
			filterValue: "",
			sortKey: "title",
			sortDir: "asc",
			viewMode: stored.viewMode === "calendar" ? "calendar" : "table",
			calendarKey: typeof stored.calendarKey === "string" ? stored.calendarKey : "",
			calendarMonth: typeof stored.calendarMonth === "string" ? stored.calendarMonth : "",
			...stored
		};
	}

	function updateViewState(pageId, patch = {}) {
		viewState[pageId] = {
			...getViewState(pageId),
			...patch
		};
		persistViewState();
		renderKnowledgeUI(pageId);
	}

	function getAnchorsForPage(pageId) {
		if (!pageId) return [];
		if (typeof window.getDocAnchorsForPage === "function") {
			const anchors = window.getDocAnchorsForPage(pageId);
			return Array.isArray(anchors) ? anchors : [];
		}
		if (typeof window.readStorageJSON === "function") {
			const allAnchors = window.readStorageJSON("sanctum_anchors", {});
			return Array.isArray(allAnchors?.[pageId]) ? allAnchors[pageId] : [];
		}
		return [];
	}

	function getAnchorById(pageId, anchorId) {
		return getAnchorsForPage(pageId).find((anchor) => anchor.id === anchorId) || null;
	}

	function formatDateValue(value) {
		if (!value) return "";
		const parsed = new Date(value);
		if (Number.isNaN(parsed.getTime())) return String(value);
		return parsed.toLocaleDateString();
	}

	function formatUpdatedAt(value) {
		if (!value) return "";
		const parsed = new Date(Number(value));
		if (Number.isNaN(parsed.getTime())) return "";
		return parsed.toLocaleDateString(undefined, {
			month: "short",
			day: "numeric"
		});
	}

	function getPropertyDisplayValue(prop, pageMap) {
		if (!prop) return "";

		if (prop.type === "relation") {
			const target = pageMap[prop.relationPageId] || null;
			if (!target) return "";
			const anchor = prop.relationAnchorId ? getAnchorById(prop.relationPageId, prop.relationAnchorId) : null;
			return anchor ? `${target.title} -> ${anchor.name}` : target.title;
		}

		if (prop.type === "date") return formatDateValue(prop.value);
		return String(prop.value || "").trim();
	}

	function getCustomPropertyByKey(record, propertyKey) {
		if (!record || !propertyKey.startsWith("prop:")) return null;
		const slug = propertyKey.slice(5);
		return (Array.isArray(record.knowledgeProperties) ? record.knowledgeProperties : []).find(
			(prop) => normalizePropertyKey(prop.name) === slug
		) || null;
	}

	function getRecordValue(record, propertyKey, pageMap) {
		if (!record) return "";

		if (propertyKey.startsWith("prop:")) {
			return getPropertyDisplayValue(getCustomPropertyByKey(record, propertyKey), pageMap);
		}

		switch (propertyKey) {
			case "title":
				return record.title || "";
			case "type":
				return record.type === "domain" ? "Domain" : "Page";
			case "layout":
				return record.layout || "";
			case "category":
				return record.category || "";
			case "createdAt":
				return formatUpdatedAt(record.createdAt);
			case "updatedAt":
				return formatUpdatedAt(record.updatedAt);
			default:
				return "";
		}
	}

	function getContextCollection(pageId) {
		const current = getPageRecord(pageId);
		const records = getAllRecords();
		if (!current) {
			return { label: "Collection view", records: [] };
		}

		const children = records.filter((record) => record.parent === pageId);
		if (children.length) {
			return {
				label: `Children of ${current.title}`,
				records: children
			};
		}

		if (current.parent) {
			const parent = getPageRecord(current.parent);
			return {
				label: parent ? `${parent.title} Collection` : "Related Pages",
				records: records.filter((record) => record.parent === current.parent)
			};
		}

		return {
			label: "All Pages",
			records
		};
	}

	function buildViewOptions(records, currentRecord) {
		const options = [
			{ key: "title", label: "Title" },
			{ key: "type", label: "Type" },
			{ key: "layout", label: "Layout" },
			{ key: "category", label: "Category" },
			{ key: "createdAt", label: "Created" },
			{ key: "updatedAt", label: "Updated" }
		];

		const customMap = new Map();
		[...records, currentRecord].filter(Boolean).forEach((record) => {
			(Array.isArray(record.knowledgeProperties) ? record.knowledgeProperties : []).forEach((prop) => {
				const slug = normalizePropertyKey(prop.name);
				if (!slug || customMap.has(slug)) return;
				customMap.set(slug, { key: `prop:${slug}`, label: prop.name.trim() || "Property" });
			});
		});

		return [...options, ...Array.from(customMap.values()).sort((a, b) => a.label.localeCompare(b.label))];
	}

	function pickViewColumns(records, state, viewOptions) {
		const selected = [];
		const used = new Set(["type", "updatedAt"]);

		if (state.filterKey && state.filterKey.startsWith("prop:")) {
			selected.push(state.filterKey);
			used.add(state.filterKey);
		}

		if (state.sortKey && state.sortKey.startsWith("prop:") && !used.has(state.sortKey)) {
			selected.push(state.sortKey);
			used.add(state.sortKey);
		}

		viewOptions
			.filter((option) => option.key.startsWith("prop:"))
			.forEach((option) => {
				if (selected.length >= 2 || used.has(option.key)) return;
				const hasValue = records.some((record) => getRecordValue(record, option.key, getPageMap()));
				if (hasValue) {
					selected.push(option.key);
					used.add(option.key);
				}
			});

		return ["type", ...selected, "updatedAt"];
	}

	function applyCollectionView(records, state, pageMap) {
		const filterKey = state.filterKey || "";
		const filterValue = String(state.filterValue || "").trim().toLowerCase();

		let next = [...records];
		if (filterKey && filterValue) {
			next = next.filter((record) => String(getRecordValue(record, filterKey, pageMap) || "")
				.toLowerCase()
				.includes(filterValue));
		}

		const sortKey = state.sortKey || "title";
		const direction = state.sortDir === "desc" ? -1 : 1;
		next.sort((left, right) => {
			if (sortKey === "updatedAt" || sortKey === "createdAt") {
				const leftValue = Number(left[sortKey] || 0);
				const rightValue = Number(right[sortKey] || 0);
				return (leftValue - rightValue) * direction;
			}

			const leftValue = String(getRecordValue(left, sortKey, pageMap) || "").toLowerCase();
			const rightValue = String(getRecordValue(right, sortKey, pageMap) || "").toLowerCase();
			return leftValue.localeCompare(rightValue) * direction;
		});

		return next;
	}

	function getCalendarSourceOptions(records, currentRecord) {
		const options = [];
		const seen = new Set();

		const addOption = (key, label) => {
			if (!key || seen.has(key)) return;
			seen.add(key);
			options.push({ key, label });
		};

		addOption("updatedAt", "Updated");
		addOption("createdAt", "Created");

		[...records, currentRecord].filter(Boolean).forEach((record) => {
			(Array.isArray(record.knowledgeProperties) ? record.knowledgeProperties : []).forEach((prop) => {
				if (prop.type !== "date") return;
				const slug = normalizePropertyKey(prop.name);
				if (!slug) return;
				addOption(`prop:${slug}`, prop.name.trim() || "Date");
			});
		});

		return options;
	}

	function getRecordDate(record, propertyKey) {
		if (!record || !propertyKey) return null;

		if (propertyKey === "updatedAt" || propertyKey === "createdAt") {
			const raw = Number(record[propertyKey] || 0);
			const parsed = new Date(raw);
			return Number.isNaN(parsed.getTime()) ? null : parsed;
		}

		if (propertyKey.startsWith("prop:")) {
			const prop = getCustomPropertyByKey(record, propertyKey);
			if (!prop || prop.type !== "date" || !prop.value) return null;
			const parsed = new Date(prop.value);
			return Number.isNaN(parsed.getTime()) ? null : parsed;
		}

		return null;
	}

	function getMonthKey(date = new Date()) {
		return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
	}

	function normalizeMonthKey(value = "", fallback = new Date()) {
		const [yearText = "", monthText = ""] = String(value || "").split("-");
		const year = Number(yearText);
		const month = Number(monthText);
		if (Number.isInteger(year) && Number.isInteger(month) && month >= 1 && month <= 12) {
			return `${year}-${String(month).padStart(2, "0")}`;
		}
		return getMonthKey(fallback);
	}

	function shiftMonthKey(value = "", delta = 0) {
		const normalized = normalizeMonthKey(value);
		const [yearText, monthText] = normalized.split("-");
		const base = new Date(Number(yearText), Number(monthText) - 1, 1);
		base.setMonth(base.getMonth() + delta);
		return getMonthKey(base);
	}

	function formatMonthLabel(value = "") {
		const normalized = normalizeMonthKey(value);
		const [yearText, monthText] = normalized.split("-");
		const date = new Date(Number(yearText), Number(monthText) - 1, 1);
		return date.toLocaleDateString(undefined, {
			month: "long",
			year: "numeric"
		});
	}

	function toDayKey(date) {
		return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
	}

	function buildCalendarHTML(records, state, calendarOptions) {
		const selectedKey = calendarOptions.some((option) => option.key === state.calendarKey)
			? state.calendarKey
			: (calendarOptions.find((option) => option.key.startsWith("prop:"))?.key || calendarOptions[0]?.key || "updatedAt");
		const monthKey = normalizeMonthKey(state.calendarMonth);
		const [yearText, monthText] = monthKey.split("-");
		const monthDate = new Date(Number(yearText), Number(monthText) - 1, 1);
		const gridStart = new Date(monthDate);
		gridStart.setDate(1 - monthDate.getDay());
		const todayKey = toDayKey(new Date());
		const entriesByDay = new Map();

		records.forEach((record) => {
			const date = getRecordDate(record, selectedKey);
			if (!date) return;
			const dayKey = toDayKey(date);
			if (!entriesByDay.has(dayKey)) {
				entriesByDay.set(dayKey, []);
			}
			entriesByDay.get(dayKey).push(record);
		});

		entriesByDay.forEach((items) => {
			items.sort((left, right) => String(left.title || "").localeCompare(String(right.title || "")));
		});

		const weekdayHTML = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
			.map((label) => `<span>${label}</span>`)
			.join("");

		let scheduledCount = 0;
		const dayHTML = Array.from({ length: 42 }, (_, index) => {
			const cellDate = new Date(gridStart);
			cellDate.setDate(gridStart.getDate() + index);
			const dayKey = toDayKey(cellDate);
			const items = entriesByDay.get(dayKey) || [];
			scheduledCount += items.length;
			const isOutside = cellDate.getMonth() !== monthDate.getMonth();
			const isToday = dayKey === todayKey;
			const visibleItems = items.slice(0, 3).map((record) => {
				const meta = record.type === "domain"
					? "Domain"
					: (record.category && record.category !== "none" ? record.category : (record.layout || "Page"));
				return `
					<button
						class="knowledge-calendar-event"
						data-knowledge-action="open-page"
						data-target-page-id="${escapeHTML(record.id)}"
					>
						<span class="knowledge-calendar-event-title">${escapeHTML(record.title || "Untitled")}</span>
						<span class="knowledge-calendar-event-meta">${escapeHTML(meta)}</span>
					</button>
				`;
			}).join("");

			return `
				<div class="knowledge-calendar-day${isOutside ? " outside" : ""}${isToday ? " today" : ""}">
					<div class="knowledge-calendar-day-top">
						<span class="knowledge-calendar-day-number">${cellDate.getDate()}</span>
						${items.length ? `<span class="knowledge-calendar-day-count">${items.length}</span>` : ""}
					</div>
					<div class="knowledge-calendar-events">
						${visibleItems || '<div class="knowledge-calendar-empty">&nbsp;</div>'}
						${items.length > 3 ? `<div class="knowledge-calendar-more">+${items.length - 3} more</div>` : ""}
					</div>
				</div>
			`;
		}).join("");

		const sourceLabel = calendarOptions.find((option) => option.key === selectedKey)?.label || "Updated";

		return `
			<div class="knowledge-calendar-wrap">
				<div class="knowledge-calendar-toolbar">
					<select class="knowledge-select" data-knowledge-action="view-calendar-key">
						${calendarOptions.map((option) => `
							<option value="${escapeHTML(option.key)}"${option.key === selectedKey ? " selected" : ""}>Date: ${escapeHTML(option.label)}</option>
						`).join("")}
					</select>
					<div class="knowledge-calendar-nav">
						<button class="knowledge-mini-btn" data-knowledge-action="calendar-prev">←</button>
						<div class="knowledge-calendar-month">${escapeHTML(formatMonthLabel(monthKey))}</div>
						<button class="knowledge-mini-btn" data-knowledge-action="calendar-next">→</button>
						<button class="knowledge-mini-btn" data-knowledge-action="calendar-today">Today</button>
					</div>
				</div>
				<div class="knowledge-calendar-weekdays">${weekdayHTML}</div>
				<div class="knowledge-calendar-grid">${dayHTML}</div>
				<div class="knowledge-field-help">
					${scheduledCount
						? `Showing ${scheduledCount} scheduled item${scheduledCount === 1 ? "" : "s"} by ${escapeHTML(sourceLabel)}.`
						: `No matching pages have a value in ${escapeHTML(sourceLabel)} yet.`}
				</div>
			</div>
		`;
	}

	function getRelationLinks(record, pageMap) {
		const props = Array.isArray(record?.knowledgeProperties) ? record.knowledgeProperties : [];
		return props
			.filter((prop) => prop.type === "relation" && prop.relationPageId)
			.map((prop) => {
				const target = pageMap[prop.relationPageId] || null;
				const anchor = prop.relationAnchorId ? getAnchorById(prop.relationPageId, prop.relationAnchorId) : null;
				return {
					propertyId: prop.id,
					label: prop.name || "Relation",
					pageId: prop.relationPageId,
					title: target?.title || "Missing page",
					anchorId: prop.relationAnchorId || "",
					anchorName: anchor?.name || ""
				};
			});
	}

	function getBacklinks(pageId) {
		if (typeof window.findReferencesTo === "function") {
			return window.findReferencesTo(pageId);
		}
		return [];
	}

	function getConnectionTypeLabel(type = "") {
		const labels = {
			"page-card": "page card",
			mention: "mention",
			relation: "field link",
			semantic: "smart link",
			"database-row": "database item"
		};
		return labels[type] || "connection";
	}

	function getConnectionRecordTitle(nodeId = "", pageMap = {}) {
		if (pageMap[nodeId]) return pageMap[nodeId].title || "Untitled";
		if (typeof window.getVaultRecordById === "function") {
			const record = window.getVaultRecordById(nodeId);
			if (record) return record.title || "Untitled";
		}
		const graph = typeof window.buildRelationshipGraphModel === "function" ? window.buildRelationshipGraphModel() : null;
		const node = graph?.nodes?.find((item) => item.id === nodeId);
		return node?.title || "Unknown page";
	}

	function getConnectionPathLabel(nodeId = "") {
		if (String(nodeId || "").startsWith("dbrow:")) return "Database item";
		if (typeof window.getVaultRecordPathLabel === "function") {
			return window.getVaultRecordPathLabel(nodeId, { omitSelf: true });
		}
		return "";
	}

	function buildConnectionRowHTML(item, action = "open-page") {
		const path = item.path ? `<span class="knowledge-link-meta">${escapeHTML(item.path)}</span>` : "";
		return `
			<button
				class="knowledge-link-row"
				data-knowledge-action="${escapeHTML(action)}"
				data-target-page-id="${escapeHTML(item.pageId)}"
			>
				<span class="knowledge-link-title">${escapeHTML(item.title)}</span>
				<span class="knowledge-link-meta">${escapeHTML(item.meta)}</span>
				${path}
			</button>
		`;
	}

	function mergeConnectionItem(map, key, next) {
		const existing = map.get(key);
		if (!existing) {
			map.set(key, { ...next });
			return;
		}
		existing.count += next.count || 1;
		const typeSet = new Set([...(existing.types || []), ...(next.types || [])]);
		existing.types = Array.from(typeSet);
		existing.meta = `${existing.types.join(", ")}${existing.count > 1 ? ` x${existing.count}` : ""}`;
	}

	function getGraphConnections(pageId, pageMap) {
		if (typeof window.buildRelationshipGraphModel !== "function") {
			return { outgoing: [], incoming: [], database: [] };
		}

		const model = window.buildRelationshipGraphModel();
		const outgoing = new Map();
		const incoming = new Map();
		const database = new Map();
		const usableTypes = new Set(["page-card", "mention", "relation", "semantic"]);

		(model.edges || []).forEach((edge) => {
			if (!edge || edge.type === "contains" || edge.type === "backlink") return;
			const fromId = edge.from || "";
			const toId = edge.to || "";
			const typeLabel = getConnectionTypeLabel(edge.type);
			const count = Number(edge.count || 1) || 1;

			if (edge.type === "database-row" || fromId.startsWith("dbrow:") || toId.startsWith("dbrow:")) {
				if (fromId !== pageId && toId !== pageId) return;
				const dbId = fromId === pageId ? toId : fromId;
				mergeConnectionItem(database, `${dbId}:${edge.type}`, {
					pageId: pageId,
					title: getConnectionRecordTitle(dbId, pageMap),
					path: getConnectionPathLabel(dbId),
					types: [typeLabel],
					count,
					meta: `${typeLabel}${count > 1 ? ` x${count}` : ""}`
				});
				return;
			}

			if (!usableTypes.has(edge.type)) return;

			if (fromId === pageId && toId !== pageId) {
				mergeConnectionItem(outgoing, `${toId}:${edge.type}`, {
					pageId: toId,
					title: getConnectionRecordTitle(toId, pageMap),
					path: getConnectionPathLabel(toId),
					types: [typeLabel],
					count,
					meta: `${typeLabel}${count > 1 ? ` x${count}` : ""}`
				});
			}

			if (toId === pageId && fromId !== pageId) {
				mergeConnectionItem(incoming, `${fromId}:${edge.type}`, {
					pageId: fromId,
					title: getConnectionRecordTitle(fromId, pageMap),
					path: getConnectionPathLabel(fromId),
					types: [typeLabel],
					count,
					meta: `${typeLabel}${count > 1 ? ` x${count}` : ""}`
				});
			}
		});

		const sortItems = (items) => items.sort((a, b) => (
			String(a.title || "").localeCompare(String(b.title || ""), undefined, { sensitivity: "base", numeric: true })
		));

		return {
			outgoing: sortItems(Array.from(outgoing.values())),
			incoming: sortItems(Array.from(incoming.values())),
			database: sortItems(Array.from(database.values()))
		};
	}

	function buildPropertyRowsHTML(pageId, record, pageMap) {
		const props = Array.isArray(record.knowledgeProperties) ? record.knowledgeProperties : [];
		if (!props.length) {
			return `<div class="knowledge-empty">No custom fields yet.</div>`;
		}

		return props.map((prop) => {
			const relationOptions = getScopedRelationOptions(
				getAllRecords().filter((item) => item.id !== pageId),
				pageId,
				prop.relationPageId
			);
			const anchorOptions = prop.type === "relation" && prop.relationPageId
				? getAnchorsForPage(prop.relationPageId).map((anchor) => `
						<option value="${escapeHTML(anchor.id)}"${anchor.id === prop.relationAnchorId ? " selected" : ""}>${escapeHTML(anchor.name)}</option>
					`).join("")
				: "";
			const optionsValue = Array.isArray(prop.options) ? prop.options.join(", ") : "";

			return `
				<div class="knowledge-prop-row" data-prop-id="${escapeHTML(prop.id)}">
					<div class="knowledge-field-grid">
						<input
							class="knowledge-input"
							data-knowledge-action="prop-name"
							value="${escapeHTML(prop.name)}"
							placeholder="Field name"
						/>
						<select class="knowledge-select" data-knowledge-action="prop-type">
							${PROPERTY_TYPES.map((item) => `
								<option value="${item.value}"${item.value === prop.type ? " selected" : ""}>${item.label}</option>
							`).join("")}
						</select>
						<button class="knowledge-mini-btn danger" data-knowledge-action="remove-property">Remove</button>
					</div>
					<div class="knowledge-field-grid knowledge-field-grid-secondary">
						${prop.type === "relation" ? `
							<select class="knowledge-select" data-knowledge-action="prop-relation-page">
								<option value="">Choose a page</option>
								${relationOptions}
							</select>
							<select class="knowledge-select" data-knowledge-action="prop-relation-anchor">
								<option value="">Whole page</option>
								${anchorOptions}
							</select>
							<div class="knowledge-field-help">Open this page or a specific document anchor from the Links panel.</div>
						` : prop.type === "select" ? `
							<input
								class="knowledge-input"
								data-knowledge-action="prop-options"
								value="${escapeHTML(optionsValue)}"
								placeholder="Options: draft, active, done"
							/>
							<input
								class="knowledge-input"
								data-knowledge-action="prop-value"
								value="${escapeHTML(prop.value)}"
								placeholder="Selected value"
							/>
							<div class="knowledge-field-help">Separate options with commas.</div>
						` : `
							<input
								class="knowledge-input"
								data-knowledge-action="prop-value"
								value="${escapeHTML(prop.value)}"
								type="${prop.type === "number" ? "number" : (prop.type === "date" ? "date" : "text")}"
								placeholder="Value"
							/>
							<div class="knowledge-field-help">${prop.type === "date" ? "Use a calendar date for timeline-style filtering." : "Saved on change."}</div>
						`}
					</div>
				</div>
			`;
		}).join("");
	}

	function buildBuiltInSummaryHTML(record) {
		const chips = [];
		if (record.type === "domain") chips.push("Domain");
		if (record.layout) chips.push(`Layout: ${record.layout}`);
		if (record.category && record.category !== "none") chips.push(`Category: ${record.category}`);
		if (record.containerType) chips.push(`Container: ${record.containerType}`);
		if (!chips.length) chips.push("Page");

		return chips.map((chip) => `<span class="knowledge-chip">${escapeHTML(chip)}</span>`).join("");
	}

	function buildPanelSectionHTML(title, subtitle, bodyHTML, count = "", open = false) {
		return `
			<details class="knowledge-panel-section"${open ? " open" : ""}>
				<summary class="knowledge-panel-summary">
					<span>
						<span class="knowledge-panel-title">${escapeHTML(title)}</span>
						${subtitle ? `<span class="knowledge-panel-subtitle">${escapeHTML(subtitle)}</span>` : ""}
					</span>
					${count !== "" ? `<span class="knowledge-panel-count">${escapeHTML(count)}</span>` : ""}
				</summary>
				<div class="knowledge-panel-body">
					${bodyHTML}
				</div>
			</details>
		`;
	}

	function getDefaultOpenBehavior(category = "", containerType = "") {
		if (containerType === "detail") return "peek";
		return ["character", "spell", "item", "location", "event", "medication", "condition"].includes(category) ? "peek" : "open";
	}

	function getContainerTypeLabel(containerType = "") {
		const labels = {
			hub: "Hub",
			project: "Project area",
			page: "Page",
			detail: "Detail record",
			"database-row": "Database item"
		};
		return labels[containerType] || "Page";
	}

	function isDatabaseRowRecord(record) {
		const rowRef = record?.databaseRowRef || {};
		return record?.containerType === "database-row" || !!(rowRef.sourcePageId && rowRef.rowId);
	}

	function recordDefinesScope(record) {
		if (!record) return false;
		if (record.type === "domain") return true;
		if (record.isScopeBoundary === true || record.definesScope === true) return true;
		if (record.isScopeBoundary === false || record.definesScope === false) return false;
		return record.containerType === "project";
	}

	function buildStructureHTML(pageId, record) {
		const isDomain = record.type === "domain";
		const isDatabaseRow = isDatabaseRowRecord(record);
		const containerType = isDomain ? "domain" : (record.containerType || "page");
		const aliasesValue = normalizeAliasList(record.aliases || record.alias || "").join(", ");
		const scopeId = typeof window.getVaultTopLevelScopeId === "function" ? window.getVaultTopLevelScopeId(pageId) : "";
		const scopeTitle = scopeId === pageId
			? "This page"
			: ((typeof window.getVaultScopeLabel === "function" && window.getVaultScopeLabel(scopeId)) || "Global");
		const scopeChecked = recordDefinesScope(record);
		const levelOptions = ["page", "hub", "project", "detail"].map((value) => `
			<option value="${value}"${containerType === value ? " selected" : ""}>${getContainerTypeLabel(value)}</option>
		`).join("");
		const levelControl = isDomain || isDatabaseRow
			? `<div class="knowledge-static-value">${escapeHTML(isDomain ? "Domain" : isDatabaseRow ? "Database row" : getContainerTypeLabel(containerType))}</div>`
			: `
				<select class="knowledge-select" data-knowledge-action="structure-container-type">
					${levelOptions}
				</select>
			`;

		return `
			<div class="knowledge-card">
				<div class="knowledge-card-head">
					<div>
						<div class="knowledge-card-title">Page setup</div>
						<div class="knowledge-card-subtitle">Role, names, and local area.</div>
					</div>
				</div>
				<div class="knowledge-structure-grid">
					<label class="knowledge-structure-field">
						<span>Page type</span>
						${levelControl}
					</label>
					<label class="knowledge-structure-field">
						<span>Area</span>
						<div class="knowledge-static-value">${escapeHTML(scopeTitle)}</div>
					</label>
					<label class="knowledge-structure-field knowledge-structure-field-wide">
						<span>Also known as</span>
						<input
							class="knowledge-input"
							data-knowledge-action="structure-aliases"
							value="${escapeHTML(aliasesValue)}"
							placeholder="Other names separated by commas"
						/>
					</label>
				</div>
				<label class="knowledge-check-row">
					<input
						type="checkbox"
						data-knowledge-action="structure-scope-boundary"
						${scopeChecked ? " checked" : ""}
						${isDomain ? " disabled" : ""}
					/>
					<span>
						<span class="knowledge-check-title">${isDomain ? "This is an area" : "Make this page an area"}</span>
						<span class="knowledge-check-help">${isDomain ? "Domains always hold their own pages." : "Links made inside it will prefer pages from here."}</span>
					</span>
				</label>
			</div>
		`;
	}

	function buildViewHTML(pageId, currentRecord, collection, state, pageMap) {
		const viewOptions = buildViewOptions(collection.records, currentRecord);
		const columns = pickViewColumns(collection.records, state, viewOptions);
		const filtered = applyCollectionView(collection.records, state, pageMap);
		const gridTemplate = `minmax(0, 1.6fr) ${columns.map(() => "minmax(0, 0.9fr)").join(" ")}`;
		const calendarOptions = getCalendarSourceOptions(collection.records, currentRecord);
		const viewMode = state.viewMode === "calendar" ? "calendar" : "table";

		const headerCells = columns.map((key) => {
			const option = viewOptions.find((item) => item.key === key);
			return `<span>${escapeHTML(option?.label || key)}</span>`;
		}).join("");

		const tableBody = filtered.length
			? filtered.map((record) => {
					const typeLabel = record.type === "domain" ? "Domain" : (record.category && record.category !== "none" ? record.category : "Page");
					const cells = columns.map((key) => {
						if (key === "type") return `<span class="knowledge-view-cell">${escapeHTML(typeLabel)}</span>`;
						return `<span class="knowledge-view-cell">${escapeHTML(getRecordValue(record, key, pageMap) || "-")}</span>`;
					}).join("");

					return `
						<button
							class="knowledge-view-row${record.id === pageId ? " active" : ""}"
							data-knowledge-action="open-page"
							data-target-page-id="${escapeHTML(record.id)}"
							style="grid-template-columns:${gridTemplate};"
						>
							<span class="knowledge-view-title-wrap">
								<span class="knowledge-view-title">${escapeHTML(record.title || "Untitled")}</span>
								<span class="knowledge-view-subtitle">${escapeHTML(record.summary || record.layout || "Open page")}</span>
							</span>
							${cells}
						</button>
					`;
				}).join("")
			: `<div class="knowledge-empty">No pages match this view.</div>`;

		const viewBody = viewMode === "calendar"
			? buildCalendarHTML(filtered, state, calendarOptions)
			: `
				<div class="knowledge-view-table">
					<div class="knowledge-view-header" style="grid-template-columns:${gridTemplate};">
						<span>Page</span>
						${headerCells}
					</div>
					<div class="knowledge-view-body">
						${tableBody}
					</div>
				</div>
			`;

		return `
			<div class="knowledge-card">
				<div class="knowledge-card-head">
					<div>
						<div class="knowledge-card-title">View</div>
						<div class="knowledge-card-subtitle">${escapeHTML(collection.label)}</div>
					</div>
					<div class="knowledge-view-toggle">
						<button class="knowledge-segment-btn${viewMode === "table" ? " active" : ""}" data-knowledge-action="view-mode" data-view-mode="table">Table</button>
						<button class="knowledge-segment-btn${viewMode === "calendar" ? " active" : ""}" data-knowledge-action="view-mode" data-view-mode="calendar">Calendar</button>
					</div>
				</div>
				<div class="knowledge-toolbar">
					<select class="knowledge-select" data-knowledge-action="view-filter-key">
						<option value="">Filter by</option>
						${viewOptions.map((option) => `
							<option value="${escapeHTML(option.key)}"${option.key === state.filterKey ? " selected" : ""}>${escapeHTML(option.label)}</option>
						`).join("")}
					</select>
					<input
						class="knowledge-input"
						data-knowledge-action="view-filter-value"
						value="${escapeHTML(state.filterValue || "")}"
						placeholder="Contains..."
					/>
					<select class="knowledge-select" data-knowledge-action="view-sort-key">
						${viewOptions.map((option) => `
							<option value="${escapeHTML(option.key)}"${option.key === state.sortKey ? " selected" : ""}>Sort: ${escapeHTML(option.label)}</option>
						`).join("")}
					</select>
					<select class="knowledge-select" data-knowledge-action="view-sort-dir">
						<option value="asc"${state.sortDir === "asc" ? " selected" : ""}>Asc</option>
						<option value="desc"${state.sortDir === "desc" ? " selected" : ""}>Desc</option>
					</select>
				</div>
				${viewBody}
			</div>
		`;
	}

	function buildLinksHTML(pageId, record, pageMap, anchors) {
		const graphConnections = getGraphConnections(pageId, pageMap);

		const relationHTML = graphConnections.outgoing.length
			? graphConnections.outgoing.map((item) => buildConnectionRowHTML(item)).join("")
			: `<div class="knowledge-empty">This page does not link to other pages yet.</div>`;

		const backlinkHTML = graphConnections.incoming.length
			? graphConnections.incoming.map((item) => buildConnectionRowHTML(item)).join("")
			: `<div class="knowledge-empty">No other pages connect here yet.</div>`;

		const databaseHTML = graphConnections.database.length
			? graphConnections.database.map((item) => buildConnectionRowHTML(item, "open-page")).join("")
			: `<div class="knowledge-empty">No database items connected yet.</div>`;

		const anchorHTML = anchors.length
			? anchors.map((anchor) => `
					<div class="knowledge-anchor-row">
						<button
							class="knowledge-link-row knowledge-link-row-anchor"
							data-knowledge-action="open-anchor"
							data-target-page-id="${escapeHTML(pageId)}"
							data-target-anchor-id="${escapeHTML(anchor.id)}"
						>
							<span class="knowledge-link-title">${escapeHTML(anchor.name)}</span>
							<span class="knowledge-link-meta">Section ${Number(anchor.sectionIndex || 0) + 1}</span>
						</button>
						<button
							class="knowledge-mini-btn"
							data-knowledge-action="copy-anchor"
							data-target-page-id="${escapeHTML(pageId)}"
							data-target-anchor-id="${escapeHTML(anchor.id)}"
						>Copy Link</button>
					</div>
				`).join("")
			: `<div class="knowledge-empty">No saved sections yet.</div>`;

		return `
			<div class="knowledge-card">
				<div class="knowledge-card-head">
					<div>
						<div class="knowledge-card-title">Connections</div>
						<div class="knowledge-card-subtitle">Page cards, mentions, fields, and database items.</div>
					</div>
				</div>

				<div class="knowledge-stack-section">
					<div class="knowledge-section-label">This page connects to</div>
					<div class="knowledge-list">${relationHTML}</div>
				</div>

				<div class="knowledge-stack-section">
					<div class="knowledge-section-label">Pages that connect here</div>
					<div class="knowledge-list">${backlinkHTML}</div>
				</div>

				<div class="knowledge-stack-section">
					<div class="knowledge-section-label">Database items</div>
					<div class="knowledge-list">${databaseHTML}</div>
				</div>

				<div class="knowledge-stack-section">
					<div class="knowledge-section-label">Saved sections</div>
					<div class="knowledge-list">${anchorHTML}</div>
				</div>
			</div>
		`;
	}

	function buildKnowledgeHTML(pageId, record, pageMap) {
		const collection = getContextCollection(pageId);
		const state = getViewState(pageId);
		const anchors = getAnchorsForPage(pageId);
		const props = Array.isArray(record.knowledgeProperties) ? record.knowledgeProperties : [];
		const graphConnections = getGraphConnections(pageId, pageMap);
		const linkCount = graphConnections.outgoing.length + graphConnections.incoming.length + graphConnections.database.length + anchors.length;
		const metaChips = buildBuiltInSummaryHTML(record);
		const fieldsHTML = `
			<div class="knowledge-card knowledge-card-flat">
				<div class="knowledge-card-head">
					<div>
						<div class="knowledge-card-title">Page fields</div>
						<div class="knowledge-card-subtitle">Dates, status, related pages, or other small facts.</div>
					</div>
					<button class="knowledge-mini-btn" data-knowledge-action="add-property">+ Add</button>
				</div>
				<div class="knowledge-prop-list">
					${buildPropertyRowsHTML(pageId, record, pageMap)}
				</div>
			</div>
		`;

		return `
			<section class="knowledge-shell" data-page-id="${escapeHTML(pageId)}">
				${metaChips ? `<div class="knowledge-chip-row">${metaChips}</div>` : ""}

				<div class="knowledge-grid">
					${buildStructureHTML(pageId, record)}
					${buildPanelSectionHTML("Fields", "Small facts saved on this page.", fieldsHTML, String(props.length))}
					${buildPanelSectionHTML("Pages nearby", collection.label, buildViewHTML(pageId, record, collection, state, pageMap))}
					${buildPanelSectionHTML("Connections", "Pages this uses or pages that mention it.", buildLinksHTML(pageId, record, pageMap, anchors), String(linkCount))}
				</div>
			</section>
		`;
	}

	function clearLegacyKnowledgeHosts() {
		const pageContent = document.getElementById("pageContent");
		if (pageContent) {
			pageContent.innerHTML = "";
			pageContent.style.display = "none";
			pageContent.classList.remove("knowledge-host", "knowledge-host-canvas");
			pageContent.classList.add("hint");
		}

		document.getElementById("docKnowledgeSlot")?.remove();
	}

	function ensureKnowledgeDrawer() {
		let drawer = document.getElementById("knowledgeDrawer");
		if (drawer) return drawer;

		drawer = document.createElement("aside");
		drawer.id = "knowledgeDrawer";
		drawer.className = "knowledge-drawer";
		drawer.innerHTML = `
			<div class="knowledge-drawer-header">
				<div>
					<div class="knowledge-drawer-title">Page setup</div>
					<div class="knowledge-drawer-subtitle" id="knowledgeDrawerSubtitle"></div>
				</div>
				<button class="knowledge-drawer-close" id="knowledgeDrawerClose" aria-label="Close page setup">✕</button>
			</div>
			<div class="knowledge-drawer-body" id="knowledgeDrawerBody"></div>
		`;

		document.getElementById("main")?.appendChild(drawer);
		drawer.querySelector("#knowledgeDrawerClose")?.addEventListener("click", closeKnowledgeDrawer);
		return drawer;
	}

	function isKnowledgeDrawerOpen() {
		return !!document.getElementById("knowledgeDrawer")?.classList.contains("open");
	}

	function closeKnowledgeDrawer() {
		const drawer = document.getElementById("knowledgeDrawer");
		if (!drawer) return;
		drawer.classList.remove("open");
		activeDrawerPageId = "";

		if (typeof window.setUIState === "function") {
			const state = typeof window.getUIState === "function" ? window.getUIState() : null;
			if (state?.openOverlay === "knowledgeDrawer") {
				window.setUIState({ openOverlay: null });
			}
		}
	}

	function openKnowledgeDrawer(pageId = getCurrentPageId()) {
		if (!pageId || SYSTEM_PAGE_IDS.has(pageId)) return;
		activeDrawerPageId = pageId;
		renderKnowledgeUI(pageId);

		const drawer = ensureKnowledgeDrawer();
		if (typeof window.openOverlay === "function") {
			window.openOverlay("knowledgeDrawer", drawer);
		} else {
			drawer.classList.add("open");
		}
	}

	function toggleKnowledgeDrawer(pageId = getCurrentPageId()) {
		if (isKnowledgeDrawerOpen()) {
			closeKnowledgeDrawer();
			return;
		}
		openKnowledgeDrawer(pageId);
	}

	function resolvePendingAnchorJump(pageId) {
		if (!pendingAnchorJump || pendingAnchorJump.pageId !== pageId) return;

		const anchorId = pendingAnchorJump.anchorId;
		pendingAnchorJump = null;

		window.setTimeout(() => {
			const didJump = typeof window.jumpToDocAnchorById === "function"
				? window.jumpToDocAnchorById(anchorId)
				: false;
			if (!didJump) {
				window.showAppToast?.("That document anchor is no longer available.", "info");
			}
		}, 140);
	}

	function renderKnowledgeUI(pageId = getCurrentPageId()) {
		clearLegacyKnowledgeHosts();
		if (!pageId || SYSTEM_PAGE_IDS.has(pageId)) {
			closeKnowledgeDrawer();
			return;
		}

		const record = getPageRecord(pageId);
		if (!record) {
			closeKnowledgeDrawer();
			return;
		}

		ensureRecordKnowledgeShape(record);

		const drawer = ensureKnowledgeDrawer();
		const subtitle = drawer.querySelector("#knowledgeDrawerSubtitle");
		const body = drawer.querySelector("#knowledgeDrawerBody");
		if (!body) return;

		if (subtitle) {
			subtitle.textContent = record.title || "Untitled";
		}
		body.innerHTML = buildKnowledgeHTML(pageId, record, getPageMap());
		resolvePendingAnchorJump(pageId);
	}

	function saveKnowledgeMutation(record) {
		if (!record) return false;
		record.updatedAt = Date.now();
		if (typeof window.saveSanctumRegistry === "function") {
			return window.saveSanctumRegistry();
		}
		return false;
	}

	function addProperty(pageId) {
		const record = getPageRecord(pageId);
		if (!record) return;
		ensureRecordKnowledgeShape(record);
		record.knowledgeProperties.push(normalizeKnowledgeProperty({
			name: "",
			type: "text",
			value: ""
		}));
		if (!saveKnowledgeMutation(record)) {
			window.showAppToast?.("Couldn't save that property yet.", "info");
			renderKnowledgeUI(pageId);
		}
	}

	function mutateProperty(pageId, propertyId, mutateFn) {
		const record = getPageRecord(pageId);
		if (!record) return;
		ensureRecordKnowledgeShape(record);
		const property = record.knowledgeProperties.find((item) => item.id === propertyId);
		if (!property) return;

		mutateFn(property, record);
		if (!saveKnowledgeMutation(record)) {
			window.showAppToast?.("Couldn't save that change yet.", "info");
			renderKnowledgeUI(pageId);
		}
	}

	function removeProperty(pageId, propertyId) {
		const record = getPageRecord(pageId);
		if (!record) return;
		ensureRecordKnowledgeShape(record);
		record.knowledgeProperties = record.knowledgeProperties.filter((item) => item.id !== propertyId);
		if (!saveKnowledgeMutation(record)) {
			window.showAppToast?.("Couldn't remove that property yet.", "info");
			renderKnowledgeUI(pageId);
		}
	}

	function updateRecordStructure(pageId, mutateFn) {
		const record = getPageRecord(pageId);
		if (!record) return;
		mutateFn(record);
		if (record.type !== "domain") {
			record.containerType = record.containerType || "page";
			record.openBehavior = getDefaultOpenBehavior(record.category || "none", record.containerType);
		}
		if (!saveKnowledgeMutation(record)) {
			window.showAppToast?.("Couldn't save that structure change yet.", "info");
			renderKnowledgeUI(pageId);
			return;
		}
		if (typeof window.renderSidebarDomains === "function") window.renderSidebarDomains();
		if (typeof window.renderSidebarPins === "function") window.renderSidebarPins();
		if (typeof window.renderSidebarBookmarks === "function") window.renderSidebarBookmarks();
		renderKnowledgeUI(pageId);
	}

	function openPageOrAnchor(pageId, anchorId = "") {
		if (!pageId) return;
		if (pageId === getCurrentPageId()) {
			if (anchorId && typeof window.jumpToDocAnchorById === "function") {
				if (window.jumpToDocAnchorById(anchorId)) return;
			}
			if (!anchorId) return;
		}
		if (anchorId) {
			pendingAnchorJump = { pageId, anchorId };
		}
		if (typeof window.openPage === "function") {
			window.openPage(pageId);
		}
	}

	async function copyAnchorLink(pageId, anchorId) {
		const record = getPageRecord(pageId);
		const anchor = getAnchorById(pageId, anchorId);
		if (!record || !anchor) return;

		const token = `sanctum://page/${pageId}#anchor=${anchor.id}`;

		try {
			if (navigator.clipboard?.writeText) {
				await navigator.clipboard.writeText(token);
			} else {
				const textArea = document.createElement("textarea");
				textArea.value = token;
				textArea.setAttribute("readonly", "readonly");
				textArea.style.position = "absolute";
				textArea.style.left = "-9999px";
				document.body.appendChild(textArea);
				textArea.select();
				document.execCommand("copy");
				textArea.remove();
			}
			window.showAppToast?.(`Copied anchor link for ${anchor.name}.`);
		} catch (error) {
			window.showAppToast?.("Couldn't copy that anchor link.", "info");
		}
	}

	document.addEventListener("click", (event) => {
		const actionEl = event.target.closest("[data-knowledge-action]");
		if (!actionEl) return;
		const shell = actionEl.closest(".knowledge-shell");
		const pageId = shell?.dataset.pageId || getCurrentPageId();
		const propertyRow = actionEl.closest(".knowledge-prop-row");
		const propertyId = propertyRow?.dataset.propId || "";
		const action = actionEl.dataset.knowledgeAction;

		if (!pageId) return;

		if (action === "add-property") {
			event.preventDefault();
			addProperty(pageId);
			return;
		}

		if (action === "remove-property") {
			event.preventDefault();
			removeProperty(pageId, propertyId);
			return;
		}

		if (action === "view-mode") {
			event.preventDefault();
			updateViewState(pageId, {
				viewMode: actionEl.dataset.viewMode === "calendar" ? "calendar" : "table"
			});
			return;
		}

		if (action === "calendar-prev") {
			event.preventDefault();
			const state = getViewState(pageId);
			updateViewState(pageId, {
				viewMode: "calendar",
				calendarMonth: shiftMonthKey(state.calendarMonth, -1)
			});
			return;
		}

		if (action === "calendar-next") {
			event.preventDefault();
			const state = getViewState(pageId);
			updateViewState(pageId, {
				viewMode: "calendar",
				calendarMonth: shiftMonthKey(state.calendarMonth, 1)
			});
			return;
		}

		if (action === "calendar-today") {
			event.preventDefault();
			updateViewState(pageId, {
				viewMode: "calendar",
				calendarMonth: getMonthKey()
			});
			return;
		}

		if (action === "open-page") {
			event.preventDefault();
			openPageOrAnchor(actionEl.dataset.targetPageId || "");
			return;
		}

		if (action === "open-relation" || action === "open-anchor") {
			event.preventDefault();
			openPageOrAnchor(actionEl.dataset.targetPageId || "", actionEl.dataset.targetAnchorId || "");
			return;
		}

		if (action === "copy-anchor") {
			event.preventDefault();
			copyAnchorLink(actionEl.dataset.targetPageId || "", actionEl.dataset.targetAnchorId || "");
		}
	});

	document.addEventListener("keydown", (event) => {
		if (event.key !== "Enter") return;
		const field = event.target.closest(".knowledge-input");
		if (!field) return;
		field.blur();
	});

	document.addEventListener("change", (event) => {
		const field = event.target.closest("[data-knowledge-action]");
		if (!field) return;

		const shell = field.closest(".knowledge-shell");
		const pageId = shell?.dataset.pageId || getCurrentPageId();
		const propertyRow = field.closest(".knowledge-prop-row");
		const propertyId = propertyRow?.dataset.propId || "";
		const action = field.dataset.knowledgeAction;

		if (action === "view-filter-key") {
			updateViewState(pageId, { filterKey: field.value || "" });
			return;
		}

		if (action === "view-filter-value") {
			updateViewState(pageId, { filterValue: field.value || "" });
			return;
		}

		if (action === "view-sort-key") {
			updateViewState(pageId, { sortKey: field.value || "title" });
			return;
		}

		if (action === "view-sort-dir") {
			updateViewState(pageId, { sortDir: field.value === "desc" ? "desc" : "asc" });
			return;
		}

		if (action === "view-calendar-key") {
			updateViewState(pageId, {
				viewMode: "calendar",
				calendarKey: field.value || ""
			});
			return;
		}

		if (action === "structure-container-type") {
			updateRecordStructure(pageId, (record) => {
				const nextType = ["page", "hub", "project", "detail"].includes(field.value) ? field.value : "page";
				record.containerType = nextType;
				if (nextType === "project" && record.isScopeBoundary !== false) {
					record.isScopeBoundary = true;
				}
			});
			return;
		}

		if (action === "structure-scope-boundary") {
			updateRecordStructure(pageId, (record) => {
				record.isScopeBoundary = record.type === "domain" ? true : field.checked === true;
			});
			return;
		}

		if (action === "structure-aliases") {
			updateRecordStructure(pageId, (record) => {
				record.aliases = normalizeAliasList(field.value);
				delete record.alias;
			});
			return;
		}

		if (!propertyId) return;

		if (action === "prop-name") {
			mutateProperty(pageId, propertyId, (property) => {
				property.name = field.value.trim();
			});
			return;
		}

		if (action === "prop-type") {
			mutateProperty(pageId, propertyId, (property) => {
				property.type = field.value || "text";
				property.value = "";
				property.options = [];
				property.relationPageId = "";
				property.relationAnchorId = "";
			});
			return;
		}

		if (action === "prop-value") {
			mutateProperty(pageId, propertyId, (property) => {
				property.value = field.value;
			});
			return;
		}

		if (action === "prop-options") {
			mutateProperty(pageId, propertyId, (property) => {
				property.options = parsePropertyOptions(field.value);
			});
			return;
		}

		if (action === "prop-relation-page") {
			mutateProperty(pageId, propertyId, (property) => {
				property.relationPageId = field.value || "";
				const anchors = getAnchorsForPage(property.relationPageId);
				if (!anchors.some((anchor) => anchor.id === property.relationAnchorId)) {
					property.relationAnchorId = "";
				}
			});
			return;
		}

		if (action === "prop-relation-anchor") {
			mutateProperty(pageId, propertyId, (property) => {
				property.relationAnchorId = field.value || "";
			});
		}
	});

	const previousPageOpenHook = window.onSanctumPageOpen;
	window.onSanctumPageOpen = function onSanctumPageOpen(pageId) {
		if (typeof previousPageOpenHook === "function") {
			previousPageOpenHook(pageId);
		}
		if (isKnowledgeDrawerOpen()) {
			renderKnowledgeUI(pageId);
		}
	};

	const previousRegistryHook = window.onSanctumRegistryChanged;
	window.onSanctumRegistryChanged = function onSanctumRegistryChanged(payload) {
		if (typeof previousRegistryHook === "function") {
			previousRegistryHook(payload);
		}
		if (isKnowledgeDrawerOpen()) {
			renderKnowledgeUI(activeDrawerPageId || getCurrentPageId());
		}
	};

	const previousAnchorsHook = window.onSanctumAnchorsChanged;
	window.onSanctumAnchorsChanged = function onSanctumAnchorsChanged(pageId, anchors) {
		if (typeof previousAnchorsHook === "function") {
			previousAnchorsHook(pageId, anchors);
		}
		if (isKnowledgeDrawerOpen() && pageId === (activeDrawerPageId || getCurrentPageId())) {
			renderKnowledgeUI(pageId);
		}
	};

	window.renderKnowledgeUI = renderKnowledgeUI;
	window.openKnowledgeDrawer = openKnowledgeDrawer;
	window.closeKnowledgeDrawer = closeKnowledgeDrawer;
	window.toggleKnowledgeDrawer = toggleKnowledgeDrawer;
	window.isKnowledgeDrawerOpen = isKnowledgeDrawerOpen;

	ensureRegistryKnowledgeShape();
	clearLegacyKnowledgeHosts();
})();
