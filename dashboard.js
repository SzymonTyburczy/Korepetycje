		// ── ZMIENNE GLOBALNE I STAN APLIKACJI ──
		let currentProfile = null;
		let viewingUserId = null;
		let viewingPaymentUserId = null;
		let viewingLessonsUserId = null;
		let allLessonsUserFilter = "all";
		let userLessonsSort = "date-asc";
		let viewingPaymentPair = null;
		let expandedPaymentLessonIds = [];
		let expandedAdminStudentIds = [];
		let expandedTutorStudentIds = [];
		let expandedPaymentStudentIds = [];
		let expandedAssignmentStudentIds = [];
		let appData = {
			lessons: [],
			payments: [],
			materials: [],
			users: [],
			assignments: [],
			adminNotes: {},
			tutorStudentNotes: [],
		};

		const sidebarItems = {
			uczen: [
				{ id: "overview", icon: "🏠", label: "Przegląd" },
				{ id: "lessons", icon: "📅", label: "Moje lekcje" },
				{ id: "history", icon: "📖", label: "Historia" },
				{ id: "materials", icon: "📁", label: "Materiały" },
				{ id: "payments", icon: "💳", label: "Opłaty" },
				{ id: "book", icon: "➕", label: "Nowa lekcja" },
				{ id: "profile", icon: "👤", label: "Profil" },
			],
			korepetytor: [
				{ id: "overview", icon: "🏠", label: "Przegląd" },
				{ id: "lessons", icon: "📅", label: "Moje lekcje" },
				{ id: "students", icon: "👥", label: "Uczniowie" },
				{ id: "materials", icon: "📁", label: "Materiały" },
				{ id: "profile", icon: "👤", label: "Profil" },
			],
			admin: [
				{ id: "overview", icon: "🏠", label: "Przegląd" },
				{ id: "all-lessons", icon: "📅", label: "Wszystkie lekcje" },
				{ id: "all-users", icon: "👥", label: "Użytkownicy" },
				{ id: "students", icon: "👥", label: "Uczniowie" },
				{ id: "all-payments", icon: "💳", label: "Opłaty" },
				{ id: "profile", icon: "👤", label: "Profil" },
			],
		};

		function toInputDate(iso) {
			if (!iso) return "";
			const d = new Date(iso);
			const off = d.getTimezoneOffset();
			return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
		}
		function toInputTime(iso) {
			if (!iso) return "10:00";
			const d = new Date(iso);
			return d.toTimeString().slice(0, 5);
		}
		function toInputDateOnly(iso) {
			if (!iso) return "";
			return toInputDate(iso);
		}
		function calcUserDebt(userId) {
			return appData.lessons
				.filter((l) => l.studentId === userId && l.status === "odbyta" && !l.paid)
				.reduce((s, l) => s + Number(l.price || 0), 0);
		}
		function calcUserPaidTotal(userId) {
			return appData.lessons
				.filter((l) => l.studentId === userId && l.status === "odbyta" && l.paid)
				.reduce((s, l) => s + Number(l.price || 0), 0);
		}
		function getStudents() {
			return (appData.users || []).filter((u) => u.role === "uczen");
		}
		function getTutors() {
			return (appData.users || []).filter((u) => u.role === "korepetytor" || u.role === "admin");
		}
		function isTutorRole(role) {
			return role === "korepetytor" || role === "admin";
		}
		function displayUserName(u) {
			return u?.full_name || u?.email || "Bez nazwy";
		}
		function lessonsForUser(u) {
			if (!u) return [];
			if (u.role === "uczen") return appData.lessons.filter((l) => l.studentId === u.id);
			if (isTutorRole(u.role)) return appData.lessons.filter((l) => l.tutorId === u.id);
			return appData.lessons.filter((l) => l.studentId === u.id || l.tutorId === u.id);
		}
		function sortLessons(lessons, sortKey = userLessonsSort) {
			return [...lessons].sort((a, b) => {
				switch (sortKey) {
					case "date-desc":
						return new Date(b.date) - new Date(a.date);
					case "subject":
						return (a.subject || "").localeCompare(b.subject || "", "pl");
					case "student":
						return (a.student || "").localeCompare(b.student || "", "pl");
					case "tutor":
						return (a.tutor || "").localeCompare(b.tutor || "", "pl");
					case "status":
						return (a.status || "").localeCompare(b.status || "", "pl");
					case "price-desc":
						return (Number(b.price) || 0) - (Number(a.price) || 0);
					case "price-asc":
						return (Number(a.price) || 0) - (Number(b.price) || 0);
					case "date-asc":
					default:
						return new Date(a.date) - new Date(b.date);
				}
			});
		}
		function getUserName(userId) {
			const user = (appData.users || []).find((u) => u.id === userId);
			return user?.full_name || user?.email || "Nieznany uzytkownik";
		}
		function getAssignedTutorIds(studentId) {
			return (appData.assignments || [])
				.filter((a) => a.studentId === studentId)
				.map((a) => a.tutorId);
		}
		function getAssignedStudentIds(tutorId) {
			return (appData.assignments || [])
				.filter((a) => a.tutorId === tutorId)
				.map((a) => a.studentId);
		}
		function isAssigned(studentId, tutorId) {
			return (appData.assignments || []).some((a) => a.studentId === studentId && a.tutorId === tutorId);
		}
		function pairLessons(studentId, tutorId) {
			return appData.lessons
				.filter((l) => l.studentId === studentId && (!tutorId || l.tutorId === tutorId))
				.sort((a, b) => new Date(a.date) - new Date(b.date));
		}
		function nextLessonFor(studentId, tutorId = null) {
			const now = new Date();
			return pairLessons(studentId, tutorId).find((l) => (l.status === "zaplanowana" || l.status === "oczekuje") && new Date(l.date) >= now);
		}
		function summarizeLessonsByDate(startDate, endDate) {
			const start = startDate ? new Date(`${startDate}T00:00:00`) : null;
			const end = endDate ? new Date(`${endDate}T23:59:59`) : null;
			const lessons = appData.lessons.filter((l) => {
				if (l.status !== "odbyta") return false;
				const date = new Date(l.date);
				if (start && date < start) return false;
				if (end && date > end) return false;
				return true;
			});
			const total = lessons.reduce((s, l) => s + Number(l.price || 0), 0);
			const paid = lessons.filter((l) => l.paid).reduce((s, l) => s + Number(l.price || 0), 0);
			const debt = lessons.filter((l) => !l.paid).reduce((s, l) => s + Number(l.price || 0), 0);
			return { lessons, total, paid, debt };
		}
		function firstDayOfMonth(date = new Date()) {
			return new Date(date.getFullYear(), date.getMonth(), 1).toISOString().slice(0, 10);
		}
		function lastDayOfMonth(date = new Date()) {
			return new Date(date.getFullYear(), date.getMonth() + 1, 0).toISOString().slice(0, 10);
		}
		function firstDayOfYear(date = new Date()) {
			return new Date(date.getFullYear(), 0, 1).toISOString().slice(0, 10);
		}
		function lastDayOfYear(date = new Date()) {
			return new Date(date.getFullYear(), 11, 31).toISOString().slice(0, 10);
		}
		function moneySummaryHtml(summary) {
			return `
<div class="pay-summary">
  <div class="pay-summary-item"><span>Lekcje</span><strong>${summary.lessons.length}</strong></div>
  <div class="pay-summary-item"><span>Zarobione / zaplacone</span><strong>${summary.paid} zl</strong></div>
  <div class="pay-summary-item"><span>Aktualny dlug</span><strong style="color:${summary.debt > 0 ? "#c0392b" : "var(--navy)"}">${summary.debt} zl</strong></div>
  <div class="pay-summary-item"><span>Wartosc lacznie</span><strong>${summary.total} zl</strong></div>
</div>`;
		}
		function getTutorStudentNote(studentId, tutorId) {
			return (appData.tutorStudentNotes || []).find((n) => n.studentId === studentId && n.tutorId === tutorId);
		}
		function getStudentTutorNotes(studentId) {
			return (appData.tutorStudentNotes || []).filter((n) => n.studentId === studentId);
		}

		// ── FORMATOWANIE ──
		function fmtDate(s) {
			if (!s) return "Brak daty";
			return new Date(s).toLocaleString("pl-PL", {
				day: "2-digit",
				month: "2-digit",
				year: "numeric",
				hour: "2-digit",
				minute: "2-digit",
			});
		}
		function fmtDateOnly(s) {
			if (!s) return "Brak daty";
			return new Date(s).toLocaleDateString("pl-PL", {
				day: "2-digit",
				month: "2-digit",
				year: "numeric",
			});
		}
		function badge(status) {
			const colors = {
				zaplanowana: "#2ecc71", // zielony
				oczekuje: "#f1c40f", // żółty
				odbyta: "#3498db", // niebieski
				odwolana: "#e74c3c", // czerwony
				admin: "#9b59b6", // fioletowy (dla ról)
				korepetytor: "#e67e22",
				uczen: "#95a5a6",
			};
			const color = colors[status] || "#95a5a6";
			return `<span style="background:${color}; color:white; padding:2px 8px; border-radius:4px; font-size:0.75rem; text-transform:uppercase;">${esc(status)}</span>`;
		}

		// ── ZABEZPIECZENIA (XSS) ──
		// Escapuje dane od uzytkownika przed wstawieniem do innerHTML.
		// Bezpieczne zarowno w tekscie, jak i w atrybutach ujetych w cudzyslow.
		function esc(value) {
			if (value === null || value === undefined) return "";
			return String(value)
				.replace(/&/g, "&amp;")
				.replace(/</g, "&lt;")
				.replace(/>/g, "&gt;")
				.replace(/"/g, "&quot;")
				.replace(/'/g, "&#39;");
		}
		// Dopuszcza tylko bezpieczne URL-e (blokuje np. javascript:).
		function sanitizeUrl(url) {
			if (!url) return "#";
			const trimmed = String(url).trim();
			if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith("/")) return esc(trimmed);
			return "#";
		}

		// ── POBIERANIE PRAWDZIWYCH DANYCH Z BAZY ──
		async function loadRealData() {
			// 1. Pobieranie lekcji
			const { data: lessons } = await supabaseClient
				.from("lessons")
				.select("*, tutor:profiles!tutor_id(full_name), student:profiles!student_id(full_name)")
				.order("date", { ascending: true });

			// --- NOWY KOD: AUTOMATYCZNE ZAKAŃCZANIE LEKCJI ---
			const now = new Date();
			// Szukamy lekcji, które są "zaplanowane", ale ich data + czas trwania już minęły
			const pastLessonsIds = (lessons || [])
				.filter(l => {
					if (l.status !== 'zaplanowana') return false;
					const lessonEnd = new Date(new Date(l.date).getTime() + (l.duration_minutes || 60) * 60000);
					return lessonEnd < now;
				})
				.map(l => l.id);

			// Jeśli znaleziono takie lekcje, aktualizujemy je w bazie jednym zapytaniem
			if (pastLessonsIds.length > 0) {
				await supabaseClient.from('lessons').update({ status: 'odbyta' }).in('id', pastLessonsIds);
				// Aktualizujemy też lokalnie, żeby od razu wyświetliły się poprawnie
				lessons.forEach(l => {
					if (pastLessonsIds.includes(l.id)) l.status = 'odbyta';
				});
			}
			// ------------------------------------------------

			// 2. Pobieranie materiałów
			const { data: materials } = await supabaseClient
				.from("materials")
				.select("*, tutor:profiles!tutor_id(full_name)")
				.order("created_at", { ascending: false });

			const { data: assignments, error: assignmentsError } = await supabaseClient
				.from("student_tutor_assignments")
				.select("student_id, tutor_id");
			if (assignmentsError) {
				console.warn("Brak tabeli student_tutor_assignments lub uprawnien RLS:", assignmentsError.message);
			}

			const { data: tutorNotes, error: tutorNotesError } = await supabaseClient
				.from("tutor_student_notes")
				.select("student_id, tutor_id, note, updated_at, tutor:profiles!tutor_id(full_name), student:profiles!student_id(full_name)");
			if (tutorNotesError) {
				console.warn("Brak tabeli tutor_student_notes lub uprawnien RLS:", tutorNotesError.message);
			}

			// 3. Pobieranie profili z uwzględnieniem ról i prywatności
			if (currentProfile.role === "admin") {
				const { data: profiles } = await supabaseClient.from("profiles").select("*").order("full_name", { ascending: true });
				appData.users = profiles || [];
				const { data: notes } = await supabaseClient.from("admin_user_notes").select("user_id, note");
				appData.adminNotes = Object.fromEntries((notes || []).map((n) => [n.user_id, n.note]));
			} else if (currentProfile.role === "korepetytor") {
				const { data: profiles } = await supabaseClient.from("profiles").select("*").eq("role", "uczen").order("full_name", { ascending: true });
				appData.users = profiles || [];
			} else {
				const { data: profiles } = await supabaseClient.from("profiles").select("*").in("role", ["korepetytor", "admin"]).order("full_name", { ascending: true });
				appData.users = profiles || [];
			}

			// Mapowanie danych dla interfejsu
			appData.lessons = (lessons || []).map((l) => ({
				id: l.id,
				studentId: l.student_id,
				tutorId: l.tutor_id,
				subject: l.subject,
				tutor: l.tutor?.full_name || "Nieprzypisany",
				student: l.student?.full_name || "Nieznany Uczeń",
				date: l.date,
				duration: l.duration_minutes || 60,
				status: l.status,
				price: l.price || "100",
				paid: l.paid === true || String(l.paid) === "true",
				paidAt: l.paid_at || null,
			}));

			appData.materials = (materials || []).map((m) => ({
				id: m.id,
				title: m.title,
				tutor: m.tutor?.full_name || "Korepetytor",
				date: m.created_at,
				file: m.file_url || "#",
			}));

			appData.assignments = (assignments || []).map((a) => ({
				studentId: a.student_id,
				tutorId: a.tutor_id,
			}));
			appData.tutorStudentNotes = (tutorNotes || []).map((n) => ({
				studentId: n.student_id,
				tutorId: n.tutor_id,
				note: n.note || "",
				updatedAt: n.updated_at,
				tutorName: n.tutor?.full_name || getUserName(n.tutor_id),
				studentName: n.student?.full_name || getUserName(n.student_id),
			}));
			if (currentProfile.role === "korepetytor") {
				const assignedIds = getAssignedStudentIds(currentProfile.id);
				appData.users = appData.users.filter((u) => u.role !== "uczen" || assignedIds.includes(u.id));
			} else if (currentProfile.role === "uczen") {
				const assignedTutorIds = getAssignedTutorIds(currentProfile.id);
				appData.users = appData.users.filter((u) => u.role === "admin" || assignedTutorIds.includes(u.id));
			}

			// Opłaty wyliczane z odbytych lekcji (kwota + status na podstawie pola paid)
			appData.payments = appData.lessons
				.filter((l) => l.status === "odbyta")
				.map((l) => ({
					id: l.id,
					studentId: l.studentId,
					amount: Number(l.price) || 0,
					paid: l.paid,
					paidAt: l.paidAt,
					status: l.paid ? "oplacona" : "oczekuje",
				}));
		}

		// ── PANELS ──
		function panelOverview(p) {
			const up = appData.lessons.filter(
				(l) => l.status === "zaplanowana" || l.status === "oczekuje",
			);
			const done = appData.lessons.filter((l) => l.status === "odbyta");
			const pd = appData.payments.filter((i) => i.status === "oczekuje");
			return `
<div class="panel-header"><h1>Cześć, ${esc(p.full_name?.split(" ")[0]) || "Witaj"} 👋</h1><p>Oto podsumowanie Twojego konta.</p></div>
<div class="stats-row">
<div class="stat-card"><div class="s-label">Nadchodzące</div><div class="s-val">${up.length}</div><div class="s-sub">lekcje</div></div>
<div class="stat-card"><div class="s-label">Odbyte</div><div class="s-val">${done.length}</div><div class="s-sub">łącznie</div></div>
<div class="stat-card"><div class="s-label">Do zapłaty</div><div class="s-val">${pd.reduce((s, i) => s + i.amount, 0)} zł</div><div class="s-sub">${pd.length} opłata/y</div></div>
<div class="stat-card"><div class="s-label">Materiały</div><div class="s-val">${appData.materials.length}</div><div class="s-sub">pliki</div></div>
</div>
<div class="data-wrap">
<div class="data-head"><h3>Najbliższe lekcje</h3><button class="btn btn-gold" onclick="showPanel('book')" style="font-size:.8rem;padding:.4rem .9rem;">+ Zarezerwuj</button></div>
${up.length
					? `
<div class="lesson-cards">${up.map((l) => `<div class="lesson-card"><div class="lesson-card-top"><div class="lesson-card-subject">${esc(l.subject)}</div>${badge(l.status)}</div><div class="lesson-card-meta"><span>👨‍🏫 ${esc(l.tutor)}</span><span>📅 ${fmtDate(l.date)} · ${l.duration} min</span><span>💰 ${esc(l.price)} zł</span></div></div>`).join("")}</div>
<div class="lesson-table-wrap"><table><thead><tr><th>Przedmiot</th><th>Korepetytor</th><th>Data</th><th>Czas</th><th>Status</th></tr></thead><tbody>${up.map((l) => `<tr><td><strong>${esc(l.subject)}</strong></td><td>${esc(l.tutor)}</td><td>${fmtDate(l.date)}</td><td>${l.duration} min</td><td>${badge(l.status)}</td></tr>`).join("")}</tbody></table></div>
`
					: `<div class="empty-state"><div class="icon">📅</div><p>Brak zaplanowanych lekcji.<br><br><button class="btn btn-primary" onclick="showPanel('book')">Zarezerwuj lekcję</button></p></div>`
				}
</div>`;
		}

		function panelAllLessonsUsers() {
			const students = [...(appData.users || [])]
				.filter((u) => u.role === "uczen" && (u.full_name || u.email))
				.sort((a, b) => (a.full_name || a.email || "").localeCompare(b.full_name || b.email || "", "pl"));
			const tutors = [...(appData.users || [])]
				.filter((u) => isTutorRole(u.role) && (u.full_name || u.email))
				.sort((a, b) => (a.full_name || a.email || "").localeCompare(b.full_name || b.email || "", "pl"));
			const groups = [
				{ id: "students", title: `Uczniowie (${students.length})`, users: students },
				{ id: "tutors", title: `Korepetytorzy (${tutors.length})`, users: tutors },
			].filter((group) => allLessonsUserFilter === "all" || group.id === allLessonsUserFilter);
			const total = groups.reduce((sum, group) => sum + group.users.length, 0);
			return `
<div class="panel-header"><h1>Wszystkie lekcje</h1><p>Wybierz uzytkownika, aby zobaczyc jego lekcje.</p></div>
<div class="data-wrap">
  <div class="data-head">
    <h3>Uzytkownicy (${total})</h3>
    <div style="display:flex;gap:.5rem;flex-wrap:wrap;align-items:center;">
      <label style="font-size:.82rem;color:var(--text-muted);">Pokaz</label>
      <select onchange="setAllLessonsUserFilter(this.value)" style="min-height:38px;border:1px solid var(--border);border-radius:4px;background:white;padding:.35rem .65rem;font-family:inherit;">
        <option value="all" ${allLessonsUserFilter === "all" ? "selected" : ""}>Wszyscy</option>
        <option value="students" ${allLessonsUserFilter === "students" ? "selected" : ""}>Tylko uczniowie</option>
        <option value="tutors" ${allLessonsUserFilter === "tutors" ? "selected" : ""}>Tylko korepetytorzy</option>
      </select>
    </div>
  </div>
  ${total ? `
  <div class="pay-user-list">
    ${groups.map((group) => `
      <div style="padding:.75rem 1.2rem .35rem;color:var(--text-muted);font-size:.72rem;text-transform:uppercase;letter-spacing:.08em;font-weight:700;">${group.title}</div>
      ${group.users.length ? group.users.map((u) => {
				const lessons = lessonsForUser(u);
				const next = lessons.find((l) => (l.status === "zaplanowana" || l.status === "oczekuje") && new Date(l.date) >= new Date());
				return `
    <div class="pay-user-item" onclick="openUserLessons('${u.id}')">
      <div><strong>${esc(displayUserName(u))}</strong><div style="font-size:.82rem;color:var(--text-muted);">${badge(u.role)} ${lessons.length} lekcji</div></div>
      <span style="font-size:.85rem;color:var(--text-muted);">${next ? fmtDate(next.date) : "Brak nadchodzacych"}</span>
    </div>`;
			}).join("") : `<div class="empty-state" style="padding:1.5rem 1rem;"><p>Brak uzytkownikow w tej grupie.</p></div>`}
    `).join("")}
  </div>` : `<div class="empty-state"><p>Brak uzytkownikow.</p></div>`}
</div>`;
		}

		function panelUserLessons() {
			const u = (appData.users || []).find((x) => x.id === viewingLessonsUserId);
			if (!u) return `<div class="empty-state"><p>Nie znaleziono uzytkownika.</p><button class="btn btn-primary" onclick="showAllLessonsList()">Wroc</button></div>`;
			const userLessons = sortLessons(lessonsForUser(u));
			return `
<div class="panel-header">
  <button type="button" style="margin-bottom:.8rem;padding:.3rem 0;background:none;border:none;color:var(--navy);cursor:pointer;font-family:inherit;font-size:.9rem;" onclick="showAllLessonsList()">← Wroc do listy</button>
  <h1>${esc(displayUserName(u))}</h1>
  <p>${u.role === "uczen" ? "Lekcje wybranego ucznia." : "Lekcje prowadzone przez wybranego korepetytora."}</p>
</div>
<div class="data-wrap">
  <div class="data-head">
    <h3>Lekcje (${userLessons.length})</h3>
    <div style="display:flex;gap:.5rem;flex-wrap:wrap;align-items:center;">
      <label style="font-size:.82rem;color:var(--text-muted);">Sortuj</label>
      <select onchange="setUserLessonsSort(this.value)" style="min-height:38px;border:1px solid var(--border);border-radius:4px;background:white;padding:.35rem .65rem;font-family:inherit;">
        <option value="date-asc" ${userLessonsSort === "date-asc" ? "selected" : ""}>Data rosnaco</option>
        <option value="date-desc" ${userLessonsSort === "date-desc" ? "selected" : ""}>Data malejaco</option>
        <option value="student" ${userLessonsSort === "student" ? "selected" : ""}>Uczen A-Z</option>
        <option value="tutor" ${userLessonsSort === "tutor" ? "selected" : ""}>Korepetytor A-Z</option>
        <option value="subject" ${userLessonsSort === "subject" ? "selected" : ""}>Przedmiot A-Z</option>
        <option value="status" ${userLessonsSort === "status" ? "selected" : ""}>Status A-Z</option>
        <option value="price-desc" ${userLessonsSort === "price-desc" ? "selected" : ""}>Koszt malejaco</option>
        <option value="price-asc" ${userLessonsSort === "price-asc" ? "selected" : ""}>Koszt rosnaco</option>
      </select>
    </div>
  </div>
  ${userLessons.length ? `
  <div class="lesson-table-wrap" style="display:block;overflow-x:auto;">
    <table>
      <thead><tr><th>Uczen</th><th>Korepetytor</th><th>Przedmiot</th><th>Data</th><th>Czas</th><th>Koszt</th><th>Status</th><th></th></tr></thead>
      <tbody>
        ${userLessons.map((l) => `
        <tr>
          <td><strong>${esc(l.student)}</strong></td>
          <td>${esc(l.tutor)}</td>
          <td>${esc(l.subject)}</td>
          <td>${fmtDate(l.date)}</td>
          <td>${l.duration} min</td>
          <td>${esc(l.price)} zl</td>
          <td>${badge(l.status)}</td>
          <td style="white-space:nowrap;">
            ${l.status === "zaplanowana" ? `<button class="btn btn-gold" style="padding:.3rem .7rem;font-size:.8rem;background:#2ecc71;border-color:#2ecc71;color:white;" onclick="markAsDone('${l.id}')">Odbyla sie</button>` : ""}
            <button class="btn btn-outline" style="color:red;border-color:red;padding:.3rem .7rem;font-size:.8rem;margin-left:.3rem;" onclick="deleteLesson('${l.id}')">Usun</button>
          </td>
        </tr>`).join("")}
      </tbody>
    </table>
  </div>` : `<div class="empty-state"><p>Ten uzytkownik nie ma jeszcze lekcji.</p></div>`}
</div>`;
		}

		function panelAllLessons() {
			if (currentProfile.role === "admin") {
				if (viewingLessonsUserId) return panelUserLessons();
				return panelAllLessonsUsers();
			}
			const pending = appData.lessons.filter((l) => l.status === "oczekuje");
			const confirmed = appData.lessons.filter((l) => l.status === "zaplanowana");
			const history = appData.lessons.filter((l) => l.status === "odbyta" || l.status === "odwolana");

			// Sprawdzamy role
			const isAdmin = currentProfile.role === "admin";
			const isTutor = currentProfile.role === "korepetytor";
			const canManage = isAdmin || isTutor; // Używane w oczekujących (bo korepetytor musi móc zatwierdzić)

			return `
<div class="panel-header">
    <h1>Wszystkie Lekcje</h1>
    <p>Zarządzaj rezerwacjami i przeglądaj historię spotkań.</p>
</div>

<div class="data-wrap">
    <div class="data-head"><h3>Oczekujące prośby (${pending.length})</h3></div>
    ${pending.length
					? `
    <div class="lesson-table-wrap" style="display:block">
        <table>
            <thead><tr><th>Uczeń</th><th>Korepetytor</th><th>Przedmiot</th><th>Data</th><th>Status / Akcja</th></tr></thead>
            <tbody>
                ${pending.map((l) => `
                    <tr>
                        <td><strong>${esc(l.student)}</strong></td>
                        <td>${esc(l.tutor)}</td>
                        <td>${esc(l.subject)}</td>
                        <td>${fmtDate(l.date)}</td>
                        <td>
                            ${canManage ? `
                                <button class="btn btn-gold" style="padding: .3rem .7rem; font-size: .8rem;" onclick="approveLesson('${l.id}')">Potwierdź</button>
                                <button class="btn btn-outline" style="padding: .3rem .7rem; font-size: .8rem; margin-left: .5rem;" onclick="rejectLesson('${l.id}')">Odrzuć</button>
                                ${isAdmin ? `<button class="btn btn-outline" style="color:red; border-color:red; padding:.3rem .7rem; font-size:.8rem; margin-left:.5rem;" onclick="deleteLesson('${l.id}')">Usuń z bazy</button>` : ''}
                            ` : `
                                <span style="font-size: 0.8rem; color: #d39e00; font-weight: 600;">⏳ Czeka na akceptację</span>
                            `}
                        </td>
                    </tr>
                `).join("")}
            </tbody>
        </table>
    </div>
    `
					: `<div class="empty-state"><p>Brak oczekujących próśb na ten moment.</p></div>`
				}
</div>

<div class="data-wrap">
    <div class="data-head"><h3>Nadchodzące lekcje (${confirmed.length})</h3></div>
    ${confirmed.length
					? `
    <div class="lesson-table-wrap" style="display:block">
        <table>
            <thead>
                <tr>
                    <th>Uczeń</th><th>Korepetytor</th><th>Przedmiot</th><th>Data</th><th>Status</th>
                    ${isAdmin ? '<th>Akcja</th>' : ''} </tr>
            </thead>
            <tbody>
                ${confirmed.map((l) => `
                    <tr>
                        <td><strong>${esc(l.student)}</strong></td>
                        <td>${esc(l.tutor)}</td>
                        <td>${esc(l.subject)}</td>
                        <td>${fmtDate(l.date)}</td>
                        <td>${badge(l.status)}</td>
                        ${isAdmin ? ` <td>
                            <button class="btn btn-gold" style="padding:.3rem .7rem; font-size:.8rem; background:#2ecc71; border-color:#2ecc71; color:white;" onclick="markAsDone('${l.id}')">Zakończ</button>
                            <button class="btn btn-outline" style="color:red; border-color:red; padding:.3rem .7rem; font-size:.8rem; margin-left:.5rem;" onclick="deleteLesson('${l.id}')">Usuń</button>
                        </td>
                        ` : ''}
                    </tr>
                `).join("")}
            </tbody>
        </table>
    </div>
    `
					: `<div class="empty-state"><p>Brak zatwierdzonych, nadchodzących lekcji.</p></div>`
				}
</div>

<div class="data-wrap">
    <div class="data-head"><h3>Historia i odwołane (${history.length})</h3></div>
    ${history.length
					? `
    <div class="lesson-table-wrap" style="display:block">
        <table>
            <thead>
                <tr>
                    <th>Uczeń</th><th>Korepetytor</th><th>Przedmiot</th><th>Data</th><th>Status</th>
                    ${isAdmin ? '<th>Akcja</th>' : ''}
                </tr>
            </thead>
            <tbody>
                ${history.map((l) => `
                    <tr>
                        <td><strong>${esc(l.student)}</strong></td>
                        <td>${esc(l.tutor)}</td>
                        <td>${esc(l.subject)}</td>
                        <td>${fmtDate(l.date)}</td>
                        <td>${badge(l.status)}</td>
                        ${isAdmin ? `
                        <td>
                            <button class="btn btn-outline" style="color:red; border-color:red; padding:.3rem .7rem; font-size:.8rem;" onclick="deleteLesson('${l.id}')">Usuń z bazy</button>
                        </td>
                        ` : ''}
                    </tr>
                `).join("")}
            </tbody>
        </table>
    </div>
    `
					: `<div class="empty-state"><p>Historia jest pusta.</p></div>`
				}
</div>`;
		}

		function panelHistory() {
			const done = appData.lessons.filter(
				(l) => l.status === "odbyta" || l.status === "odwolana",
			);
			return `
<div class="panel-header"><h1>Historia lekcji</h1><p>Zakończone i odwołane lekcje.</p></div>
<div class="data-wrap">
<div class="data-head"><h3>Historia</h3></div>
${done.length
					? `
<div class="lesson-cards">${done.map((l) => `<div class="lesson-card"><div class="lesson-card-top"><div class="lesson-card-subject">${esc(l.subject)}</div>${badge(l.status)}</div><div class="lesson-card-meta"><span>👨‍🏫 ${esc(l.tutor)}</span><span>📅 ${fmtDate(l.date)}</span><span>💰 ${esc(l.price)} zł</span></div></div>`).join("")}</div>
<div class="lesson-table-wrap"><table><thead><tr><th>Przedmiot</th><th>Korepetytor</th><th>Data</th><th>Czas</th><th>Cena</th><th>Status</th></tr></thead><tbody>${done.map((l) => `<tr><td>${esc(l.subject)}</td><td>${esc(l.tutor)}</td><td>${fmtDate(l.date)}</td><td>${l.duration} min</td><td>${esc(l.price)} zł</td><td>${badge(l.status)}</td></tr>`).join("")}</tbody></table></div>
`
					: `<div class="empty-state"><div class="icon">📖</div><p>Historia lekcji jest jeszcze pusta.</p></div>`
				}
</div>`;
		}

		function panelMaterials() {
			return `
<div class="panel-header"><h1>Materiały</h1><p>Pliki i notatki od korepetytorów.</p></div>
<div class="data-wrap">
<div class="data-head"><h3>Twoje materiały</h3></div>
${appData.materials.length
					? appData.materials
						.map(
							(m) => `
<div class="material-item">
<div class="mat-icon">📄</div>
<div class="mat-info"><div class="mat-title">${esc(m.title)}</div><div class="mat-meta">${esc(m.tutor)} · ${fmtDateOnly(m.date)}</div></div>
<a href="${sanitizeUrl(m.file)}" class="mat-dl" target="_blank" rel="noopener noreferrer">📥 Pobierz</a>
</div>`,
						)
						.join("")
					: `<div class="empty-state"><div class="icon">📁</div><p>Nie masz jeszcze żadnych materiałów do pobrania.</p></div>`
				}
</div>`;
		}

		function panelStudents() {
			if (currentProfile.role === "admin") {
				return panelAdminStudents();
			}
			const assignedIdsNew = getAssignedStudentIds(currentProfile.id);
			const studentsNew = getStudents()
				.filter((s) => assignedIdsNew.includes(s.id))
				.sort((a, b) => (a.full_name || a.email || "").localeCompare(b.full_name || b.email || "", "pl"));
			return `
<div class="panel-header"><h1>Uczniowie</h1><p>Uczniowie przypisani do Twojego konta.</p></div>
<div class="data-wrap">
  <div class="data-head"><h3>Moi uczniowie (${studentsNew.length})</h3></div>
  ${studentsNew.length ? `
  <div class="pay-lesson-list">
    ${studentsNew.map((s) => {
				const lessons = pairLessons(s.id, currentProfile.id);
				const next = nextLessonFor(s.id, currentProfile.id);
				const note = getTutorStudentNote(s.id, currentProfile.id)?.note || "";
				const expanded = expandedTutorStudentIds.includes(s.id);
				return `
    <div class="pay-lesson-card${expanded ? " expanded" : " collapsed"}" style="cursor:pointer;" onclick="toggleTutorStudent('${s.id}')">
      <div class="pay-lesson-head" style="margin-bottom:${expanded ? ".85rem" : "0"};">
        <div>
          <div class="pay-lesson-title">${esc(s.full_name || s.email)}</div>
          <div class="pay-lesson-meta">${esc(s.email || "Brak e-maila")} · ${lessons.length} lekcji</div>
          <div class="pay-lesson-meta">Najblizsza: ${next ? `${fmtDate(next.date)} · ${esc(next.subject)}` : "brak zaplanowanych"}</div>
        </div>
        <span style="font-size:.82rem;color:var(--navy);font-weight:700;">${expanded ? "Ukryj" : "Rozwin"}</span>
      </div>
      ${expanded ? `
      <div onclick="event.stopPropagation()">
        <button type="button" class="btn btn-primary" style="padding:.35rem .75rem;font-size:.78rem;" onclick="openStudentLessons('${s.id}')">Lekcje</button>
      <div class="student-note-box">
        <label style="display:block;font-size:.76rem;letter-spacing:.08em;text-transform:uppercase;color:var(--navy);font-weight:600;margin-bottom:.35rem;">Moja prywatna notatka</label>
        <textarea id="tutor-note-${s.id}" maxlength="500" placeholder="Krotki opis ucznia, preferencje, poziom, cele...">${esc(note)}</textarea>
        <div class="student-note-actions">
          <button type="button" class="btn btn-gold" style="padding:.35rem .75rem;font-size:.78rem;" onclick="saveTutorStudentNote('${s.id}')">Zapisz notatke</button>
          <span class="student-note-msg" id="tutor-note-msg-${s.id}"></span>
        </div>
      </div>
      </div>` : ""}
    </div>`;
			}).join("")}
  </div>` : `<div class="empty-state"><p>Nie masz jeszcze przypisanych uczniow. Administrator moze przypisac ich w panelu Przeglad.</p></div>`}
</div>`;
			const assignedIds = currentProfile.role === "admin"
				? getAssignedStudentIds(currentProfile.id)
				: getAssignedStudentIds(currentProfile.id);
			const students = getStudents()
				.filter((s) => assignedIds.includes(s.id))
				.sort((a, b) => (a.full_name || a.email || "").localeCompare(b.full_name || b.email || "", "pl"));
			return `
<div class="panel-header"><h1>Uczniowie</h1><p>Uczniowie przypisani do Twojego konta.</p></div>
<div class="data-wrap">
  <div class="data-head"><h3>Moi uczniowie (${students.length})</h3></div>
  ${students.length ? `
  <div class="lesson-table-wrap" style="display:block;overflow-x:auto;">
    <table>
      <thead><tr><th>Uczen</th><th>E-mail</th><th>Najblizsza lekcja</th><th>Liczba lekcji</th><th></th></tr></thead>
      <tbody>
        ${students.map((s) => {
				const lessons = pairLessons(s.id, currentProfile.id);
				const next = nextLessonFor(s.id, currentProfile.id);
				return `
        <tr>
          <td><strong>${esc(s.full_name || s.email)}</strong></td>
          <td>${esc(s.email || "—")}</td>
          <td>${next ? `${fmtDate(next.date)} · ${esc(next.subject)}` : "Brak zaplanowanych"}</td>
          <td>${lessons.length}</td>
          <td><button type="button" class="btn btn-primary" style="padding:.3rem .7rem;font-size:.78rem;" onclick="openStudentLessons('${s.id}')">Lekcje →</button></td>
        </tr>`;
			}).join("")}
      </tbody>
    </table>
  </div>` : `<div class="empty-state"><p>Nie masz jeszcze przypisanych uczniow. Administrator moze przypisac ich w panelu Przeglad.</p></div>`}
</div>`;
		}

		function panelAdminStudents() {
			const grouped = getStudents()
				.map((student) => {
					const tutorIds = getAssignedTutorIds(student.id);
					const tutors = tutorIds
						.map((tutorId) => {
							const tutor = (appData.users || []).find((u) => u.id === tutorId);
							if (!tutor) return null;
							return {
								tutor,
								note: getTutorStudentNote(student.id, tutorId),
								lessons: pairLessons(student.id, tutorId),
								next: nextLessonFor(student.id, tutorId),
							};
						})
						.filter(Boolean);
					return { student, tutors };
				})
				.filter((row) => row.tutors.length)
				.sort((a, b) => (a.student.full_name || a.student.email || "").localeCompare(b.student.full_name || b.student.email || "", "pl"));
			return `
<div class="panel-header"><h1>Uczniowie</h1><p>Wszystkie przypisania i prywatne opisy korepetytorow.</p></div>
<div class="data-wrap">
  <div class="data-head"><h3>Przypisani uczniowie (${grouped.length})</h3></div>
  ${grouped.length ? `
  <div class="tutor-note-list">
    ${grouped.map((row) => {
				const expanded = expandedAdminStudentIds.includes(row.student.id);
				return `
    <div class="tutor-note-item" style="cursor:pointer;" onclick="toggleAdminStudentNotes('${row.student.id}')">
      <div class="pay-lesson-head">
        <div>
          <div class="pay-lesson-title">${esc(row.student.full_name || row.student.email)}</div>
          <div class="tutor-note-meta">${esc(row.student.email || "Brak e-maila")} · ${row.tutors.length} korepetytorow</div>
        </div>
        <span style="color:var(--text-muted);font-size:.85rem;">${expanded ? "Zwin" : "Rozwin"}</span>
      </div>
      ${expanded ? `<div class="tutor-note-list" onclick="event.stopPropagation()">
        ${row.tutors.map((item) => `
        <div class="tutor-note-item" style="background:var(--white);">
          <div class="tutor-note-meta">${esc(item.tutor.full_name || item.tutor.email)} · ${item.lessons.length} lekcji · najblizsza: ${item.next ? `${fmtDate(item.next.date)} · ${esc(item.next.subject)}` : "brak"}</div>
          <div style="font-size:.9rem;color:var(--navy);"><strong>Korepetytor:</strong> ${item.note?.note ? esc(item.note.note) : "<span style='color:var(--text-muted)'>Brak notatki.</span>"}</div>
        </div>`).join("")}
      </div>` : ""}
    </div>`;
			}).join("")}
  </div>` : `<div class="empty-state"><p>Brak przypisanych uczniow.</p></div>`}
</div>`;
		}

		function panelpayments() {
			if (currentProfile.role === "admin") {
				if (viewingPaymentPair) return panelAdminUserPayments();
				return panelAdminPaymentsUsers();
			}
			return panelStudentPayments();
		}

		function panelAdminPaymentsUsers() {
			const grouped = getStudents()
				.map((student) => {
					const tutorIds = getAssignedTutorIds(student.id);
					const pairs = tutorIds
						.map((tutorId) => {
							const tutor = (appData.users || []).find((u) => u.id === tutorId);
							if (!tutor) return null;
							const lessons = pairLessons(student.id, tutorId).filter((l) => l.status === "odbyta");
							const debt = lessons.filter((l) => !l.paid).reduce((s, l) => s + Number(l.price || 0), 0);
							const paid = lessons.filter((l) => l.paid).reduce((s, l) => s + Number(l.price || 0), 0);
							const total = lessons.reduce((s, l) => s + Number(l.price || 0), 0);
							return { tutor, tutorId, lessons, debt, paid, total };
						})
						.filter(Boolean);
					return {
						student,
						pairs,
						debt: pairs.reduce((s, p) => s + p.debt, 0),
						paid: pairs.reduce((s, p) => s + p.paid, 0),
						total: pairs.reduce((s, p) => s + p.total, 0),
					};
				})
				.filter((row) => row.pairs.length)
				.sort((a, b) => (a.student.full_name || a.student.email || "").localeCompare(b.student.full_name || b.student.email || "", "pl"));
			return `
<div class="panel-header"><h1>Oplaty</h1><p>Rozliczenia wedlug par uczen-korepetytor.</p></div>
<div class="data-wrap">
  ${grouped.length ? `
  <div class="pay-user-list">
    ${grouped.map((row) => {
				const expanded = expandedPaymentStudentIds.includes(row.student.id);
				return `
    <div class="tutor-note-item" style="cursor:pointer;" onclick="togglePaymentStudent('${row.student.id}')">
      <div class="pay-lesson-head">
        <div>
          <div class="pay-lesson-title">${esc(row.student.full_name || row.student.email)}</div>
          <div class="tutor-note-meta">${esc(row.student.email || "Brak e-maila")} · ${row.pairs.length} korepetytorow</div>
          <div class="pay-money-row"><span>Zapłacili: <strong>${row.paid} zl</strong></span><span>Dług: <strong style="color:${row.debt > 0 ? "#c0392b" : "var(--navy)"}">${row.debt} zl</strong></span><span>Razem: <strong>${row.total} zl</strong></span></div>
        </div>
        <span style="font-size:.85rem;color:${row.debt > 0 ? "#e74c3c" : "var(--text-muted)"};">${row.debt > 0 ? `${row.debt} zl do zaplaty` : "Rozliczone"} · ${expanded ? "Zwin" : "Rozwin"}</span>
      </div>
      ${expanded ? `<div class="pay-user-list" onclick="event.stopPropagation()">
        ${row.pairs.map((p) => `
        <div class="pay-user-item ${p.debt > 0 ? "pay-debt-soft" : ""}" onclick="openUserPayments('${row.student.id}', '${p.tutorId}')">
          <div><strong>${esc(p.tutor.full_name || p.tutor.email)}</strong><div style="font-size:.82rem;color:var(--text-muted);">${p.lessons.length} odbytych lekcji · zaplacone ${p.paid} zl · dlug ${p.debt} zl · razem ${p.total} zl</div></div>
          <span style="font-size:.85rem;color:${p.debt > 0 ? "#e74c3c" : "var(--text-muted)"};">${p.debt > 0 ? `${p.debt} zl do zaplaty` : "Rozliczone"}</span>
        </div>`).join("")}
      </div>` : ""}
    </div>`;
			}).join("")}
  </div>` : `<div class="empty-state"><p>Brak przypisanych par uczen-korepetytor. Dodaj przypisania w panelu Przeglad.</p></div>`}
</div>`;
			const users = [...(appData.users || [])]
				.filter((u) => u.full_name)
				.sort((a, b) => a.full_name.localeCompare(b.full_name, "pl"));
			return `
<div class="panel-header"><h1>Opłaty</h1></div>
<div class="data-wrap">
  ${users.length ? `
  <div class="pay-user-list">
    ${users
					.map(
						(u) => `
    <div class="pay-user-item" onclick="openUserPayments('${u.id}')">
      <strong>${esc(u.full_name)}</strong>
    </div>`,
					)
					.join("")}
  </div>` : `<div class="empty-state"><p>Brak użytkowników z uzupełnionym imieniem i nazwiskiem.</p></div>`}
</div>`;
		}

		function panelAdminUserPayments() {
			const pair = viewingPaymentPair;
			if (!pair) return panelAdminPaymentsUsers();
			const student = (appData.users || []).find((x) => x.id === pair.studentId);
			const tutor = (appData.users || []).find((x) => x.id === pair.tutorId);
			if (!student || !tutor) {
				return `<div class="empty-state"><p>Nie znaleziono przypisania.</p><button class="btn btn-primary" onclick="showPaymentsList()">Wroc</button></div>`;
			}
			const userLessons = pairLessons(pair.studentId, pair.tutorId).sort((a, b) => new Date(b.date) - new Date(a.date));
			const debt = userLessons
				.filter((l) => l.status === "odbyta" && !l.paid)
				.reduce((s, l) => s + Number(l.price || 0), 0);
			const paidTotal = userLessons
				.filter((l) => l.status === "odbyta" && l.paid)
				.reduce((s, l) => s + Number(l.price || 0), 0);
			const today = toInputDate(new Date().toISOString());
			const totalValue = userLessons.reduce((s, l) => s + Number(l.price || 0), 0);
			const heldCount = userLessons.filter((l) => l.status === "odbyta").length;
			const paidCount = userLessons.filter((l) => l.paid).length;
			return `
<div class="panel-header">
  <button type="button" class="pay-back" onclick="showPaymentsList()">← Wroc do par</button>
  <div class="pay-detail-top">
    <div>
      <h1>${esc(student.full_name || student.email)}</h1>
      <p>Korepetytor: <strong>${esc(tutor.full_name || tutor.email)}</strong></p>
    </div>
  </div>
</div>

<div class="pay-summary">
  <div class="pay-summary-item"><span>Do zaplaty</span><strong style="color:${debt > 0 ? "#e74c3c" : "#2ecc71"}">${debt} zl</strong></div>
  <div class="pay-summary-item"><span>Zaplacili lacznie</span><strong>${paidTotal} zl</strong></div>
  <div class="pay-summary-item"><span>Wartosc lekcji</span><strong>${totalValue} zl</strong></div>
  <div class="pay-summary-item"><span>Odbyte lekcje</span><strong>${heldCount}</strong></div>
  <div class="pay-summary-item"><span>Oplacone</span><strong>${paidCount}/${userLessons.length}</strong></div>
</div>

<div class="pay-editor">
  <h3>Dodaj lekcje do rozliczenia</h3>
  <div class="pay-form-grid">
    <div class="form-group"><label>Przedmiot</label><input type="text" id="newPaySubject" value="Lekcja"/></div>
    <div class="form-group"><label>Data</label><input type="date" id="newPayDate" value="${today}"/></div>
    <div class="form-group"><label>Godzina</label><input type="time" id="newPayTime" value="10:00"/></div>
    <div class="form-group"><label>Koszt</label><input type="number" id="newPayPrice" min="0" step="1" value="100"/></div>
    <div class="form-group"><label>Odbyla sie</label><select id="newPayHeld"><option value="odbyta">Tak</option><option value="odwolana">Nie</option><option value="zaplanowana">Jeszcze nie</option></select></div>
    <div class="form-group"><label>Zaplacono</label><select id="newPayPaid" onchange="toggleNewPayPaidAt()"><option value="false">Nie</option><option value="true">Tak</option></select></div>
    <div class="form-group"><label>Data wplaty</label><input type="date" id="newPayPaidAt" disabled/></div>
    <button type="button" class="btn btn-gold" style="height:2.55rem;" onclick="addPaymentLesson()">+ Dodaj</button>
  </div>
  <div id="newPayMsg" style="margin-top:.6rem;font-size:.85rem;color:var(--text-muted);"></div>
</div>

<div class="data-wrap">
  <div class="data-head"><h3>Lekcje tej pary (${userLessons.length})</h3></div>
  ${userLessons.length ? `
  <div class="pay-lesson-list">
    ${userLessons.map((l) => {
			const expanded = expandedPaymentLessonIds.includes(l.id);
			return `
    <div class="pay-lesson-card ${expanded ? "expanded" : "collapsed"} ${l.status === "odbyta" && !l.paid ? "pay-debt-soft" : ""}" onclick="togglePaymentLesson('${l.id}')">
      <div class="pay-lesson-head">
        <div>
          <div class="pay-lesson-title">${esc(l.subject || "Lekcja")}</div>
          <div class="pay-lesson-meta">${fmtDate(l.date)} · ${l.duration} min · ${esc(l.price)} zl</div>
        </div>
        <div>${badge(l.status)} ${l.paid ? `<span style="background:#2ecc71;color:white;padding:2px 8px;border-radius:4px;font-size:.75rem;margin-left:.3rem;">Oplacona</span>` : `<span style="background:#e74c3c;color:white;padding:2px 8px;border-radius:4px;font-size:.75rem;margin-left:.3rem;">Do zaplaty</span>`}</div>
      </div>
      <div class="pay-lesson-edit" onclick="event.stopPropagation()">
      <div class="pay-form-grid">
        <div class="form-group"><label>Przedmiot</label><input type="text" id="pay-subject-${l.id}" value="${esc(l.subject || "")}"/></div>
        <div class="form-group"><label>Data</label><input type="date" id="pay-date-${l.id}" value="${toInputDate(l.date)}"/></div>
        <div class="form-group"><label>Godzina</label><input type="time" id="pay-time-${l.id}" value="${toInputTime(l.date)}"/></div>
        <div class="form-group"><label>Koszt</label><input type="number" id="pay-price-${l.id}" value="${esc(l.price)}" min="0" step="1"/></div>
        <div class="form-group"><label>Odbyla sie</label><select id="pay-status-${l.id}"><option value="odbyta" ${l.status === "odbyta" ? "selected" : ""}>Tak</option><option value="odwolana" ${l.status === "odwolana" ? "selected" : ""}>Nie</option><option value="zaplanowana" ${l.status === "zaplanowana" ? "selected" : ""}>Jeszcze nie</option></select></div>
        <div class="form-group"><label>Zaplacono</label><select id="pay-paid-${l.id}" onchange="togglePayPaidAt('${l.id}')"><option value="false" ${!l.paid ? "selected" : ""}>Nie</option><option value="true" ${l.paid ? "selected" : ""}>Tak</option></select></div>
        <div class="form-group"><label>Data wplaty</label><input type="date" id="pay-paidat-${l.id}" value="${l.paidAt ? toInputDateOnly(l.paidAt) : ""}" ${!l.paid ? "disabled" : ""}/></div>
      </div>
      <div class="pay-lesson-actions">
        <button type="button" class="btn btn-gold" style="padding:.4rem .8rem;font-size:.8rem;" onclick="savePaymentLesson('${l.id}')">Zapisz</button>
        <button type="button" class="btn btn-outline" style="padding:.4rem .8rem;font-size:.8rem;color:red;border-color:red;" onclick="deletePaymentLesson('${l.id}')">Usun</button>
      </div>
      </div>
    </div>`;
		}).join("")}
  </div>` : `<div class="empty-state"><p>Brak lekcji dla tej pary. Dodaj pierwsza pozycje powyzej.</p></div>`}
</div>`;
			return `
<div class="panel-header">
  <button type="button" style="margin-bottom:.8rem;padding:.3rem 0;background:none;border:none;color:var(--navy);cursor:pointer;font-family:inherit;font-size:.9rem;" onclick="showPaymentsList()">← Wroc</button>
  <h1>${esc(student.full_name || student.email)}</h1>
  <p>${esc(tutor.full_name || tutor.email)} · <strong>Do zaplaty:</strong> <span style="color:${debt > 0 ? "#e74c3c" : "#2ecc71"}">${debt} zl</span></p>
</div>
<div class="data-wrap">
  <div class="data-head"><h3>Lekcje i rozliczenia</h3></div>
  <div class="res-form" style="margin:0;border:none;box-shadow:none;padding:0 0 1rem;border-bottom:1px solid var(--border);">
    <div class="form-row-2">
      <div class="form-group"><label>Przedmiot</label><input type="text" id="newPaySubject" value="Lekcja"/></div>
      <div class="form-group"><label>Kwota (zl)</label><input type="number" id="newPayPrice" min="0" step="1" value="100"/></div>
    </div>
    <div class="form-row-2">
      <div class="form-group"><label>Data</label><input type="date" id="newPayDate" value="${today}"/></div>
      <div class="form-group"><label>Godzina</label><input type="time" id="newPayTime" value="10:00"/></div>
    </div>
    <div class="form-row-2">
      <div class="form-group"><label>Czy lekcja sie odbyla?</label><select id="newPayHeld"><option value="odbyta">Tak</option><option value="odwolana">Nie</option><option value="zaplanowana">Jeszcze nie</option></select></div>
      <div class="form-group"><label>Zapłacono</label><select id="newPayPaid" onchange="toggleNewPayPaidAt()"><option value="false">Nie</option><option value="true">Tak</option></select></div>
    </div>
    <div class="form-group"><label>Data wplaty</label><input type="date" id="newPayPaidAt" disabled/></div>
    <button type="button" class="btn btn-gold" style="font-size:.85rem;padding:.45rem 1rem;" onclick="addPaymentLesson()">+ Dodaj lekcje</button>
    <div id="newPayMsg" style="margin-top:.5rem;font-size:.85rem;color:var(--text-muted);"></div>
  </div>
  ${userLessons.length ? `
  <div class="lesson-table-wrap" style="display:block;overflow-x:auto;margin-top:1rem;">
    <table>
      <thead><tr><th>Przedmiot</th><th>Data</th><th>Godzina</th><th>Koszt</th><th>Odbyla sie</th><th>Zapłacono</th><th>Data wplaty</th><th></th></tr></thead>
      <tbody>
        ${userLessons.map((l) => `
        <tr>
          <td><input type="text" id="pay-subject-${l.id}" value="${esc(l.subject || "")}" style="width:7rem;padding:.25rem .4rem;font-size:.8rem;"/></td>
          <td><input type="date" id="pay-date-${l.id}" value="${toInputDate(l.date)}" style="padding:.25rem .4rem;font-size:.8rem;"/></td>
          <td><input type="time" id="pay-time-${l.id}" value="${toInputTime(l.date)}" style="padding:.25rem .4rem;font-size:.8rem;"/></td>
          <td><input type="number" id="pay-price-${l.id}" value="${esc(l.price)}" min="0" step="1" style="width:4.5rem;padding:.25rem .4rem;font-size:.8rem;"/></td>
          <td><select id="pay-status-${l.id}" style="padding:.2rem;font-size:.78rem;"><option value="odbyta" ${l.status === "odbyta" ? "selected" : ""}>Tak</option><option value="odwolana" ${l.status === "odwolana" ? "selected" : ""}>Nie</option><option value="zaplanowana" ${l.status === "zaplanowana" ? "selected" : ""}>Jeszcze nie</option></select></td>
          <td><select id="pay-paid-${l.id}" onchange="togglePayPaidAt('${l.id}')" style="padding:.2rem;font-size:.78rem;"><option value="false" ${!l.paid ? "selected" : ""}>Nie</option><option value="true" ${l.paid ? "selected" : ""}>Tak</option></select></td>
          <td><input type="date" id="pay-paidat-${l.id}" value="${l.paidAt ? toInputDateOnly(l.paidAt) : ""}" ${!l.paid ? "disabled" : ""} style="padding:.25rem .4rem;font-size:.8rem;"/></td>
          <td style="white-space:nowrap;"><button type="button" class="btn btn-gold" style="padding:.25rem .5rem;font-size:.75rem;" onclick="savePaymentLesson('${l.id}')">Zapisz</button><button type="button" class="btn btn-outline" style="padding:.25rem .5rem;font-size:.75rem;color:red;border-color:red;margin-left:.3rem;" onclick="deletePaymentLesson('${l.id}')">Usun</button></td>
        </tr>`).join("")}
      </tbody>
    </table>
  </div>` : `<div class="empty-state" style="margin-top:1rem;"><p>Brak lekcji dla tej pary.</p></div>`}
</div>`;
			const u = (appData.users || []).find((x) => x.id === viewingPaymentUserId);
			if (!u) {
				return `<div class="empty-state"><p>Nie znaleziono użytkownika.</p><button class="btn btn-primary" onclick="showPaymentsList()">← Wróć</button></div>`;
			}
			const legacyUserLessons = appData.lessons
				.filter((l) => l.studentId === u.id && l.status === "odbyta")
				.sort((a, b) => new Date(b.date) - new Date(a.date));
			const legacyDebt = calcUserDebt(u.id);
			const legacyToday = toInputDate(new Date().toISOString());

			return `
<div class="panel-header">
  <button type="button" style="margin-bottom:.8rem;padding:.3rem 0;background:none;border:none;color:var(--navy);cursor:pointer;font-family:inherit;font-size:.9rem;" onclick="showPaymentsList()">← Wróć</button>
  <h1>${esc(u.full_name || "—")}</h1>
  <p style="font-size:1rem;margin-top:.4rem;"><strong>Do zapłaty:</strong> <span style="color:${debt > 0 ? "#e74c3c" : "#2ecc71"}">${debt} zł</span></p>
</div>

<div class="data-wrap">
  <div class="data-head"><h3>Zajęcia</h3></div>
  <div class="res-form" style="margin:0;border:none;box-shadow:none;padding:0 0 1rem;border-bottom:1px solid var(--border);">
    <div class="form-row-2">
      <div class="form-group"><label>Przedmiot</label><input type="text" id="newPaySubject" placeholder="Matematyka" value="Lekcja"/></div>
      <div class="form-group"><label>Kwota (zł)</label><input type="number" id="newPayPrice" min="0" step="1" value="100"/></div>
    </div>
    <div class="form-row-2">
      <div class="form-group"><label>Data</label><input type="date" id="newPayDate" value="${today}"/></div>
      <div class="form-group"><label>Godzina</label><input type="time" id="newPayTime" value="10:00"/></div>
    </div>
    <div class="form-row-2">
      <div class="form-group">
        <label>Zapłacono</label>
        <select id="newPayPaid" onchange="toggleNewPayPaidAt()">
          <option value="false">Nie</option>
          <option value="true">Tak</option>
        </select>
      </div>
      <div class="form-group"><label>Data wpłaty</label><input type="date" id="newPayPaidAt" disabled/></div>
    </div>
    <button type="button" class="btn btn-gold" style="font-size:.85rem;padding:.45rem 1rem;" onclick="addPaymentLesson()">+ Dodaj zajęcia</button>
    <div id="newPayMsg" style="margin-top:.5rem;font-size:.85rem;color:var(--text-muted);"></div>
  </div>
  ${userLessons.length ? `
  <div class="lesson-table-wrap" style="display:block;overflow-x:auto;margin-top:1rem;">
    <table>
      <thead>
        <tr>
          <th>Przedmiot</th>
          <th>Data</th>
          <th>Godzina</th>
          <th>Kwota</th>
          <th>Zapłacono</th>
          <th>Data wpłaty</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${userLessons.map((l) => `
        <tr>
          <td><input type="text" id="pay-subject-${l.id}" value="${esc(l.subject || "")}" style="width:7rem;padding:.25rem .4rem;font-size:.8rem;"/></td>
          <td><input type="date" id="pay-date-${l.id}" value="${toInputDate(l.date)}" style="padding:.25rem .4rem;font-size:.8rem;"/></td>
          <td><input type="time" id="pay-time-${l.id}" value="${toInputTime(l.date)}" style="padding:.25rem .4rem;font-size:.8rem;"/></td>
          <td><input type="number" id="pay-price-${l.id}" value="${esc(l.price)}" min="0" step="1" style="width:4.5rem;padding:.25rem .4rem;font-size:.8rem;"/></td>
          <td>
            <select id="pay-paid-${l.id}" onchange="togglePayPaidAt('${l.id}')" style="padding:.2rem;font-size:.78rem;">
              <option value="false" ${!l.paid ? "selected" : ""}>Nie</option>
              <option value="true" ${l.paid ? "selected" : ""}>Tak</option>
            </select>
          </td>
          <td><input type="date" id="pay-paidat-${l.id}" value="${l.paidAt ? toInputDateOnly(l.paidAt) : ""}" ${!l.paid ? "disabled" : ""} style="padding:.25rem .4rem;font-size:.8rem;"/></td>
          <td style="white-space:nowrap;">
            <button type="button" class="btn btn-gold" style="padding:.25rem .5rem;font-size:.75rem;" onclick="savePaymentLesson('${l.id}')">Zapisz</button>
            <button type="button" class="btn btn-outline" style="padding:.25rem .5rem;font-size:.75rem;color:red;border-color:red;margin-left:.3rem;" onclick="deletePaymentLesson('${l.id}')">Usuń</button>
          </td>
        </tr>`).join("")}
      </tbody>
    </table>
  </div>` : `<div class="empty-state" style="margin-top:1rem;"><p>Brak zajęć. Dodaj pierwszą pozycję powyżej.</p></div>`}
</div>`;
		}

		function panelStudentPayments() {
			const pastLessons = appData.lessons.filter((l) => l.status === "odbyta");
			const isTutor = currentProfile.role === "korepetytor";
			const myDebt = pastLessons.filter((l) => !l.paid).reduce((s, l) => s + Number(l.price || 0), 0);

			return `
<div class="panel-header"><h1>Opłaty</h1><p>Rozliczenia za zrealizowane zajęcia.</p></div>
${!isTutor ? `<div class="stats-row"><div class="stat-card"><div class="s-label">Do zapłaty</div><div class="s-val">${myDebt} zł</div></div></div>` : ""}
<div class="data-wrap">
    <div class="data-head"><h3>Odbyte lekcje</h3></div>
    ${pastLessons.length ? `
    <div class="lesson-table-wrap" style="display:block">
        <table>
            <thead>
                <tr>
                    <th>Przedmiot</th>
                    ${isTutor ? "<th>Uczeń</th>" : "<th>Korepetytor</th>"}
                    <th>Data</th>
                    <th>Kwota</th>
                    <th>Status</th>
                    ${isTutor ? "<th>Zmień status</th>" : "<th>Data wpłaty</th>"}
                </tr>
            </thead>
            <tbody>
                ${pastLessons.map((l) => `
                <tr>
                    <td><strong>${esc(l.subject)}</strong></td>
                    ${isTutor ? `<td>${esc(l.student)}</td>` : `<td>${esc(l.tutor)}</td>`}
                    <td>${fmtDate(l.date)}</td>
                    <td><strong>${esc(l.price)} zł</strong></td>
                    <td>
                        ${l.paid
							? `<span style="background:#2ecc71;color:white;padding:2px 8px;border-radius:4px;font-size:0.75rem;">Opłacona</span>`
							: `<span style="background:#e74c3c;color:white;padding:2px 8px;border-radius:4px;font-size:0.75rem;">Do zapłaty</span>`}
                    </td>
                    ${isTutor ? `
                    <td>
                        <select onchange="changePaymentStatus('${l.id}', this)" style="padding:.3rem;font-size:.8rem;border-radius:4px;">
                            <option value="false" ${!l.paid ? "selected" : ""}>Brak wpłaty</option>
                            <option value="true" ${l.paid ? "selected" : ""}>Opłacona</option>
                        </select>
                    </td>` : `<td>${l.paid && l.paidAt ? fmtDateOnly(l.paidAt) : "—"}</td>`}
                </tr>`).join("")}
            </tbody>
        </table>
    </div>` : `<div class="empty-state"><div class="icon">💳</div><p>Brak odbytych lekcji do rozliczenia.</p></div>`}
</div>`;
		}

		function panelBook() {
			const hours = [
				"08:00",
				"09:00",
				"10:00",
				"11:00",
				"12:00",
				"13:00",
				"14:00",
				"15:00",
				"16:00",
				"17:00",
				"18:00",
				"19:00",
				"20:00",
			];

			// Rozdzielamy użytkowników na role
			const tutors = (appData.users || []).filter(
				(u) => u.role === "korepetytor" || u.role === "admin",
			);
			const students = (appData.users || []).filter(
				(u) => u.role === "uczen",
			);

			const role = currentProfile.role;
			const visibleStudents = role === "korepetytor"
				? students.filter((s) => isAssigned(s.id, currentProfile.id))
				: students;
			const visibleTutors = role === "uczen"
				? tutors.filter((t) => isAssigned(currentProfile.id, t.id))
				: tutors;

			return `
<div class="panel-header"><h1>Zarezerwuj lekcję</h1><p>Wypełnij formularz, aby zaplanować spotkanie.</p></div>
<div class="res-form">
    <h3>Szczegóły nowej lekcji</h3>
    
    <div class="form-row-2">
        ${role === "admin" || role === "korepetytor"
					? `
        <div class="form-group">
            <label>Wybierz ucznia</label>
            <select id="bStudentId">
                <option value="">-- Wybierz ucznia --</option>
                ${visibleStudents.map((s) => `<option value="${esc(s.id)}">${esc(s.full_name || s.email)}</option>`).join("")}
            </select>
        </div>
        `
					: ""
				}

        ${role === "admin" || role === "uczen"
					? `
        <div class="form-group">
            <label>Wybierz korepetytora</label>
            <select id="bTutorId">
                <option value="">-- Wybierz nauczyciela --</option>
                ${visibleTutors.map((t) => `<option value="${esc(t.id)}">${esc(t.full_name || t.email)}</option>`).join("")}
            </select>
        </div>
        `
					: ""
				}
    </div>

    <div class="form-row-2">
      <div class="form-group"><label>Przedmiot</label><input type="text" id="bSubject" placeholder="np. Matematyka"></div>
      <div class="form-group">
          <label>Czas trwania</label>
          <select id="bDur">
              <option value="60">60 minut</option>
              <option value="90">90 minut</option>
              <option value="120">120 minut</option>
          </select>
      </div>
    </div>

    <div class="form-row-2">
      <div class="form-group"><label>Data</label><input type="date" id="bDate" min="${new Date().toISOString().split("T")[0]}"/></div>
      <div class="form-group"><label>Godzina</label><select id="bTime">${hours.map((h) => `<option>${h}</option>`).join("")}</select></div>
    </div>
    
    <div class="form-group">
        <label>Dodatkowe informacje (np. zagadnienia, dział)</label>
        <textarea id="bNotes" class="chat-input" placeholder="O czym chcesz porozmawiać na zajęciach?..." style="width: 100%; border-radius: 6px;"></textarea>
    </div>

    <button class="btn btn-gold btn-full" onclick="submitBooking()" id="bBtn">
        ${role === "uczen" ? "Wyślij prośbę o lekcję →" : "Dodaj lekcję do grafiku →"}
    </button>
</div>`;
		}

		function panelProfile(p) {
			const init = (p.full_name || "?")
				.split(" ")
				.map((w) => w[0])
				.join("")
				.slice(0, 2)
				.toUpperCase();
			return `
<div class="panel-header"><h1>Mój profil</h1><p>Zarządzaj swoimi danymi.</p></div>
<div class="profile-wrap">
<div class="profile-avatar-row">
  <div class="profile-avatar-big">${init}</div>
  <div><strong style="color:var(--navy)">${esc(p.full_name || "—")}</strong><br><span style="font-size:.85rem;color:var(--text-muted)">${esc(p.email || "")}</span><br><span class="status status-${esc(p.role)}" style="margin-top:.3rem;display:inline-block;">${esc(p.role)}</span></div>
</div>
<div class="form-group"><label>Imię i nazwisko</label><input type="text" id="profName" value="${esc(p.full_name || "")}"/></div>
<div class="form-group"><label>E-mail (nie można zmienić)</label><input type="email" value="${esc(p.email || "")}" disabled style="opacity:.6"/></div>
<div class="form-group"><label>Telefon</label><input type="tel" id="profPhone" value="${esc(p.phone || "")}" placeholder="+48 600 000 000"/></div>
<button class="btn btn-primary" onclick="saveProfile()" style="margin-top: 1rem;">Zapisz zmiany</button>
<div id="profileMsg" style="margin-top:.8rem;font-size:.88rem;color:var(--text-muted);"></div>
</div>`;
		}

		// ── NAVIGATION ──
		function goToNavItem(id) {
			const role = currentProfile?.role;
			if (id === "all-payments") {
				showPaymentsList();
				return;
			}
			if (id === "all-lessons" && role === "admin") {
				showAllLessonsList();
				return;
			}
			showPanel(id);
		}

		function getMobileNavItems(role, items) {
			const quickIds = {
				uczen: ["overview", "lessons", "payments", "profile"],
				korepetytor: ["overview", "lessons", "students", "profile"],
				admin: ["overview", "all-lessons", "all-payments", "profile"],
			};
			const ids = quickIds[role] || quickIds.uczen;
			return ids
				.map((id) => items.find((item) => item.id === id))
				.filter(Boolean);
		}

		function buildNav(role) {
			const items = sidebarItems[role] || sidebarItems.uczen;
			document.getElementById("dashSidebar").innerHTML = items
				.map(
					(i) => {
						return `
<button class="sidebar-link${i.id === "overview" ? " active" : ""}" data-panel="${i.id}" onclick="goToNavItem('${i.id}')">
<span class="sidebar-icon">${i.icon}</span>${i.label}
</button>`;
					},
				)
				.join("");

			const mobileSelect = document.getElementById("mobilePanelSelect");
			if (mobileSelect) {
				mobileSelect.innerHTML = items
					.map((i) => `<option value="${i.id}">${i.label}</option>`)
					.join("");
				mobileSelect.onchange = (event) => goToNavItem(event.target.value);
			}

			const bn = getMobileNavItems(role, items);
			document.getElementById("bottomNav").innerHTML = bn
				.map(
					(i) => {
						return `
<button class="bnav-btn${i.id === "overview" ? " active" : ""}" data-panel="${i.id}" onclick="goToNavItem('${i.id}')">
<span class="bnav-icon">${i.icon}</span>${i.label}
</button>`;
					},
				)
				.join("");
		}

		function showPanel(id) {
			const p = currentProfile;
			let html = "";
			switch (id) {
				case "overview":
					html = p.role === "admin" ? panelAdminOverview() : panelOverview(p);
					break;
				case "lessons":
					html = panelAllLessons();
					break;
				case "history":
					html = panelHistory();
					break;
				case "materials":
					html = panelMaterials();
					break;
				case "students":
					html = panelStudents();
					break;
				case "payments":
					html = panelpayments();
					break;
				case "book":
					html = panelBook();
					break;
				case "profile":
					html = panelProfile(p);
					break;
				case "all-users":
					viewingUserId = null;
					html = panelAllUsers();
					break;
				case "admin-user-profile":
					html = panelAdminUserProfile();
					break;
				case "all-lessons":
					html = panelAllLessons();
					break;
				case "all-payments":
					html = panelpayments();
					break;
				default:
					html = panelOverview(p);
			}
			document.getElementById("dashMain").innerHTML = html;
			const activePanel =
				id === "admin-user-profile"
					? "all-users"
					: id;
			document.querySelectorAll(".sidebar-link,.bnav-btn").forEach((el) => {
				el.classList.toggle("active", el.dataset.panel === activePanel);
			});
			const mobileSelect = document.getElementById("mobilePanelSelect");
			if (mobileSelect && [...mobileSelect.options].some((option) => option.value === activePanel)) {
				mobileSelect.value = activePanel;
			}
			window.scrollTo(0, 0);
		}

		function panelAdminOverview() {
			const students = getStudents();
			const tutors = getTutors();
			const yearSummary = summarizeLessonsByDate(firstDayOfYear(), lastDayOfYear());
			const monthSummary = summarizeLessonsByDate(firstDayOfMonth(), lastDayOfMonth());
			const rangeStart = document.getElementById("adminRangeStart")?.value || firstDayOfMonth();
			const rangeEnd = document.getElementById("adminRangeEnd")?.value || lastDayOfMonth();
			const rangeSummary = summarizeLessonsByDate(rangeStart, rangeEnd);
			return `<div class="panel-header"><h1>Panel Admina</h1><p>Zarzadzaj platforma i przypisaniami.</p></div>
<div class="stats-row">
<div class="stat-card"><div class="s-label">Wszystkie lekcje</div><div class="s-val">${appData.lessons.length}</div></div>
<div class="stat-card"><div class="s-label">Oplaty (suma)</div><div class="s-val">${appData.payments.reduce((s, i) => s + i.amount, 0)} zl</div></div>
</div>
<div class="data-wrap">
  <div class="data-head"><h3>Podsumowanie oplat</h3></div>
  <div class="admin-money-board">
    <div class="admin-money-card">
      <h4>Ten rok</h4>
      ${moneySummaryHtml(yearSummary)}
    </div>
    <div class="admin-money-card">
      <h4>Ten miesiac</h4>
      ${moneySummaryHtml(monthSummary)}
    </div>
  </div>
  <div class="date-summary-box">
    <h4 style="color:var(--navy);margin-bottom:.8rem;">Wybrany zakres</h4>
    <div class="date-summary-controls">
      <div class="form-group"><label>Od</label><input type="date" id="adminRangeStart" value="${rangeStart}"/></div>
      <div class="form-group"><label>Do</label><input type="date" id="adminRangeEnd" value="${rangeEnd}"/></div>
      <button type="button" class="btn btn-gold" style="height:2.55rem;padding:.55rem 1.2rem;" onclick="refreshAdminOverviewRange()">Przelicz</button>
    </div>
    <div id="adminRangeSummary">${moneySummaryHtml(rangeSummary)}</div>
  </div>
</div>
<div class="data-wrap">
  <div class="data-head"><h3>Przypisania uczniow</h3></div>
  ${students.length && tutors.length ? `
  <div class="assignment-list">
    ${students.map((s) => {
				const assignedTutors = getAssignedTutorIds(s.id)
					.map((id) => (appData.users || []).find((u) => u.id === id))
					.filter(Boolean);
				const expanded = expandedAssignmentStudentIds.includes(s.id);
				return `
    <div class="assignment-card">
      <div class="pay-lesson-title">${esc(s.full_name || s.email)}</div>
      <div class="assignment-current">
        Aktualni korepetytorzy:
        ${assignedTutors.length
						? `<strong>${esc(assignedTutors.map((t) => t.full_name || t.email).join(", "))}</strong>`
						: `<strong style="color:#c0392b;">Brak przypisanego korepetytora</strong>`}
      </div>
      <button type="button" class="assignment-toggle" onclick="toggleAssignmentStudent('${s.id}')">${expanded ? "Ukryj liste korepetytorow" : "Wybierz korepetytorow"}</button>
      ${expanded ? `<div class="assignment-options">
        ${tutors.map((t) => `
        <label class="assignment-option">
          <input type="checkbox" ${isAssigned(s.id, t.id) ? "checked" : ""} onchange="toggleStudentTutorAssignment('${s.id}', '${t.id}', this.checked)" />
          <span>${esc(t.full_name || t.email)}</span>
        </label>`).join("")}
      </div>` : ""}
    </div>`;
			}).join("")}
  </div>` : `<div class="empty-state"><p>Dodaj konta uczniow i korepetytorow, aby tworzyc przypisania.</p></div>`}
</div>`;
			return `<div class="panel-header"><h1>Panel Admina 🔑</h1><p>Zarządzaj platformą.</p></div>
<div class="stats-row">
<div class="stat-card"><div class="s-label">Wszystkie lekcje</div><div class="s-val">${appData.lessons.length}</div></div>
<div class="stat-card"><div class="s-label">Opłaty (suma)</div><div class="s-val">${appData.payments.reduce((s, i) => s + i.amount, 0)} zł</div></div>
</div>
<div class="empty-state"><p>Przejdź do innych zakładek po lewej stronie, aby zarządzać bazą.</p></div>`;
		}

		function panelAllUsers() {
			return `
<div class="panel-header"><h1>Użytkownicy</h1><p>Zarządzaj uprawnieniami i rolami kont.</p></div>
<div class="data-wrap">
    <div class="data-head"><h3>Lista użytkowników (${appData.users.length})</h3></div>
    ${appData.users.length
					? `
    <div class="lesson-table-wrap" style="display:block">
        <table>
            <thead>
                <tr>
                    <th>Imię i nazwisko</th>
                    <th>E-mail</th>
                    <th>Aktualna Rola</th>
                    <th>Zmień rolę na...</th>
                    <th>Dołączył</th>
                    <th></th>
                    <th></th>
                </tr>
            </thead>
            <tbody>
                ${appData.users
						.map(
							(u) => `
                    <tr>
                        <td><strong>${esc(u.full_name || "—")}</strong></td>
                        <td>${esc(u.email)}</td>
                        <td>${badge(u.role)}</td>
                        <td>
                            <select onchange="changeUserRole('${u.id}', this.value)" style="padding: .2rem; font-size: .8rem; border-radius: 4px;">
                                <option value="" disabled selected>Wybierz...</option>
                                <option value="uczen">Uczeń</option>
                                <option value="korepetytor">Korepetytor</option>
                                <option value="admin">Admin</option>
                            </select>
                        </td>
                        <td>${fmtDateOnly(u.created_at)}</td>
                        <td>${u.id !== currentProfile.id ? `<button type="button" class="btn btn-outline" style="padding:.3rem .7rem;font-size:.78rem;color:red;border-color:red;" onclick="deleteUserAccount('${u.id}')">Usun</button>` : ""}</td>
                        <td><button type="button" class="btn btn-primary" style="padding:.3rem .7rem;font-size:.78rem;" onclick="openUserProfile('${u.id}')">Profil →</button></td>
                    </tr>
                `,
						)
						.join("")}
            </tbody>
        </table>
    </div>
    `
					: `<div class="empty-state"><p>Brak zarejestrowanych użytkowników.</p></div>`
				}
</div>`;
		}

		function panelAdminUserProfile() {
			if (currentProfile.role !== "admin" || !viewingUserId) {
				return `<div class="empty-state"><p>Brak dostępu.</p></div>`;
			}
			const u = appData.users.find((x) => x.id === viewingUserId);
			if (!u) {
				return `<div class="empty-state"><p>Nie znaleziono użytkownika.</p><button class="btn btn-primary" onclick="showPanel('all-users')">← Wróć do listy</button></div>`;
			}
			const init = (u.full_name || "?")
				.split(" ")
				.map((w) => w[0])
				.join("")
				.slice(0, 2)
				.toUpperCase();
			const userLessons = appData.lessons.filter(
				(l) => l.studentId === u.id || l.tutorId === u.id,
			);
			const note = appData.adminNotes[u.id] || "";
			return `
<div class="panel-header">
  <button type="button" style="margin-bottom:.8rem;padding:.3rem 0;background:none;border:none;color:var(--navy);cursor:pointer;font-family:inherit;font-size:.9rem;" onclick="showPanel('all-users')">← Wróć do użytkowników</button>
  <h1>Profil użytkownika</h1>
  <p>Szczegóły konta — widoczne tylko dla administratora.</p>
</div>
<div class="profile-wrap">
  <div class="profile-avatar-row">
    <div class="profile-avatar-big">${init}</div>
    <div>
      <strong style="color:var(--navy)">${esc(u.full_name || "—")}</strong><br>
      <span style="font-size:.85rem;color:var(--text-muted)">${esc(u.email || "—")}</span><br>
      ${badge(u.role)}
    </div>
  </div>
  <div class="form-group"><label>Imię i nazwisko</label><input type="text" value="${esc(u.full_name || "—")}" disabled style="opacity:.7"/></div>
  <div class="form-group"><label>E-mail</label><input type="email" value="${esc(u.email || "—")}" disabled style="opacity:.7"/></div>
  <div class="form-group"><label>Telefon</label><input type="tel" value="${esc(u.phone || "—")}" disabled style="opacity:.7"/></div>
  <div class="form-group"><label>Rola</label><input type="text" value="${esc(u.role || "—")}" disabled style="opacity:.7"/></div>
  <div class="form-group"><label>Data rejestracji</label><input type="text" value="${fmtDate(u.created_at)}" disabled style="opacity:.7"/></div>
  <div class="form-group"><label>Liczba lekcji na koncie</label><input type="text" value="${userLessons.length}" disabled style="opacity:.7"/></div>
</div>
<div class="profile-wrap" style="margin-top:1rem;border:1px dashed rgba(201,168,76,.4);">
  <h3 style="font-family:'Playfair Display',serif;color:var(--navy);margin-bottom:.3rem;">🔒 Notatka administratora</h3>
  <p style="font-size:.85rem;color:var(--text-muted);margin-bottom:1rem;">Krótki opis widoczny wyłącznie dla Ciebie. Uczeń i korepetytor go nie zobaczą.</p>
  <div class="form-group">
    <label>Notatka (max 500 znaków)</label>
    <textarea id="adminNoteText" rows="4" maxlength="500" placeholder="Np. preferuje lekcje wieczorem, przygotowuje się do matury…" style="width:100%;padding:.6rem;border:1px solid #d8d0c0;border-radius:4px;font-family:inherit;resize:vertical;">${esc(note)}</textarea>
  </div>
  <button type="button" class="btn btn-primary" onclick="saveAdminNote()">Zapisz notatkę</button>
  <div id="adminNoteMsg" style="margin-top:.8rem;font-size:.88rem;color:var(--text-muted);"></div>
</div>
${u.id !== currentProfile.id ? `
<div class="profile-wrap" style="margin-top:1rem;border:1px solid rgba(192,57,43,.35);background:rgba(192,57,43,.04);">
  <h3 style="font-family:'Playfair Display',serif;color:#c0392b;margin-bottom:.3rem;">Usuwanie konta</h3>
  <p style="font-size:.85rem;color:var(--text-muted);margin-bottom:1rem;">Usuwa profil oraz powiazane lekcje, przypisania i notatki widoczne w panelu. Pelne usuniecie uzytkownika z Supabase Auth moze wymagac operacji po stronie backendu.</p>
  <button type="button" class="btn btn-outline" style="color:red;border-color:red;" onclick="deleteUserAccount('${u.id}')">Usun konto</button>
</div>` : ""}`;
		}

		window.openUserProfile = function (userId) {
			viewingUserId = userId;
			showPanel("admin-user-profile");
		};

		window.saveAdminNote = async function () {
			if (!viewingUserId || currentProfile.role !== "admin") return;
			const msg = document.getElementById("adminNoteMsg");
			const note = document.getElementById("adminNoteText").value.trim();
			msg.textContent = "Zapisywanie…";
			const { error } = await supabaseClient.from("admin_user_notes").upsert(
				{ user_id: viewingUserId, note, updated_at: new Date().toISOString() },
				{ onConflict: "user_id" },
			);
			if (error) {
				msg.textContent = "❌ Błąd zapisu: " + error.message;
				if (error.message.includes("admin_user_notes")) {
					msg.textContent += " — uruchom SQL z supabase-config.js w Supabase (tabela admin_user_notes).";
				}
			} else {
				appData.adminNotes[viewingUserId] = note;
				msg.textContent = "✅ Notatka zapisana.";
			}
		};

		window.deleteUserAccount = async function (userId) {
			if (currentProfile.role !== "admin") return;
			if (!userId || userId === currentProfile.id) {
				alert("Nie mozna usunac aktualnie zalogowanego konta administratora.");
				return;
			}
			const u = (appData.users || []).find((x) => x.id === userId);
			const name = u?.full_name || u?.email || "tego uzytkownika";
			if (!confirm(`Usunac konto: ${name}?\n\nTo usunie profil oraz powiazane lekcje, przypisania i notatki. Tej operacji nie mozna cofnac.`)) return;

			try {
				// Pelne usuniecie (Auth + dane) przez Edge Function z service role.
				const { data, error } = await supabaseClient.functions.invoke("delete-user", {
					body: { userId },
				});
				if (error) throw new Error(error.message);
				if (data?.error) throw new Error(data.error);

				viewingUserId = null;
				viewingLessonsUserId = null;
				viewingPaymentUserId = null;
				viewingPaymentPair = null;
				await loadRealData();
				showPanel("all-users");
				alert("Konto zostalo w pelni usuniete (Auth + dane).");
			} catch (error) {
				alert(
					"Nie udalo sie w pelni usunac konta: " + error.message +
					"\n\nUpewnij sie, ze wdrozono Edge Function 'delete-user' (supabase functions deploy delete-user)."
				);
			}
		};

		window.saveTutorStudentNote = async function (studentId) {
			if (currentProfile.role !== "korepetytor") return;
			if (!isAssigned(studentId, currentProfile.id)) {
				alert("Nie mozesz zapisac notatki dla ucznia, ktory nie jest do Ciebie przypisany.");
				return;
			}
			const textarea = document.getElementById(`tutor-note-${studentId}`);
			const msg = document.getElementById(`tutor-note-msg-${studentId}`);
			const note = (textarea?.value || "").trim();
			if (msg) msg.textContent = "Zapisywanie...";

			const { error } = await supabaseClient.from("tutor_student_notes").upsert(
				{
					student_id: studentId,
					tutor_id: currentProfile.id,
					note,
					updated_at: new Date().toISOString(),
				},
				{ onConflict: "student_id,tutor_id" },
			);

			if (error) {
				if (msg) msg.textContent = "Blad zapisu: " + error.message;
				if (error.message.includes("tutor_student_notes")) {
					alert("Brakuje tabeli tutor_student_notes. Dodaj SQL z lokalnego pliku ZMIANY_BAZY_DANYCH.md.");
				}
				return;
			}

			const existing = getTutorStudentNote(studentId, currentProfile.id);
			if (existing) {
				existing.note = note;
				existing.updatedAt = new Date().toISOString();
			} else {
				appData.tutorStudentNotes.push({
					studentId,
					tutorId: currentProfile.id,
					note,
					updatedAt: new Date().toISOString(),
					tutorName: currentProfile.full_name || currentProfile.email,
					studentName: getUserName(studentId),
				});
			}
			if (msg) msg.textContent = "Zapisano.";
		};

		// ── AKCJE ──

		window.assignAndApprove = async function (lessonId) {
			const tutorSelect = document.getElementById(`tutor-select-${lessonId}`);
			const selectedTutorId = tutorSelect.value;

			if (!selectedTutorId) {
				alert("⚠️ Najpierw wybierz korepetytora z listy!");
				return;
			}

			if (
				!confirm(
					"Czy przypisać tę lekcję do wybranego nauczyciela i ją zatwierdzić?",
				)
			)
				return;

			const { error } = await supabaseClient
				.from("lessons")
				.update({
					tutor_id: selectedTutorId,
					status: "zaplanowana",
				})
				.eq("id", lessonId);

			if (error) {
				alert("❌ Błąd: " + error.message);
			} else {
				alert("✅ Lekcja przypisana i zatwierdzona!");
				await loadRealData(); // Odśwież dane
				showPanel("all-lessons"); // Odśwież widok
			}
		};

		window.changeUserRole = async function (userId, newRole) {
			if (
				!confirm(
					`Czy na pewno chcesz zmienić rolę tego użytkownika na: ${newRole}?`,
				)
			)
				return;

			const { error } = await supabaseClient
				.from("profiles")
				.update({ role: newRole })
				.eq("id", userId);

			if (error) {
				alert("❌ Błąd zmiany roli: " + error.message);
			} else {
				alert("✅ Rola została zmieniona pomyślnie!");
				await loadRealData(); // Odświeżamy dane w tle
				showPanel("all-users"); // Przeładowujemy widok użytkowników
			}
		};

		window.approveLesson = async function (lessonId) {
			if (!confirm("Czy na pewno chcesz POTWIERDZIĆ tę lekcję?")) return;

			const { error } = await supabaseClient
				.from("lessons")
				.update({ status: "zaplanowana" })
				.eq("id", lessonId);

			if (error) {
				alert("❌ Błąd: " + error.message);
			} else {
				alert("✅ Lekcja została zatwierdzona!");
				await loadRealData(); // Odśwież dane
				showPanel("all-lessons"); // Odśwież widok
			}
		};

		window.rejectLesson = async function (lessonId) {
			if (!confirm("Czy na pewno chcesz ODRZUCIĆ tę rezerwację?")) return;

			const { error } = await supabaseClient
				.from("lessons")
				.update({ status: "odwolana" })
				.eq("id", lessonId);

			if (error) {
				alert("❌ Błąd: " + error.message);
			} else {
				alert("❌ Lekcja została odrzucona.");
				await loadRealData();
				showPanel("all-lessons");
			}
		};

		async function saveProfile() {
			const msg = document.getElementById("profileMsg");
			msg.textContent = "Zapisywanie...";
			const { error } = await supabaseClient
				.from("profiles")
				.update({
					full_name: document.getElementById("profName").value,
					phone: document.getElementById("profPhone").value,
				})
				.eq("id", currentProfile.id);
			msg.textContent = error
				? "❌ Błąd zapisu: " + error.message
				: "✅ Zapisano pomyślnie!";
		}

		async function submitBooking() {
			const dateVal = document.getElementById("bDate").value;
			const timeVal = document.getElementById("bTime").value;
			const subject = document.getElementById("bSubject").value;

			if (!dateVal || !subject) {
				alert("Wybierz datę i określ przedmiot lekcji!");
				return;
			}

			// --- NOWA WALIDACJA DATY ---
			const selectedDate = new Date(dateVal);
			const today = new Date();
			today.setHours(0, 0, 0, 0); // Zerujemy godziny, minuty i sekundy, by porównać same dni

			if (selectedDate < today) {
				alert("⚠️ Nie możesz zaplanować lekcji z datą w przeszłości!");
				return;
			}
			// ---------------------------

			const btn = document.getElementById("bBtn");
			btn.textContent = "Przetwarzanie...";
			btn.disabled = true;

			const role = currentProfile.role;
			let finalStudentId = currentProfile.id;
			let finalTutorId = null;

			// Logika przypisywania
			if (role === 'admin') {
				finalStudentId = document.getElementById("bStudentId")?.value;
				finalTutorId = document.getElementById("bTutorId")?.value;
				if (!finalStudentId || !finalTutorId) {
					alert("Jako admin musisz wybrać zarówno ucznia, jak i korepetytora z list!");
					btn.textContent = "Dodaj lekcję do grafiku →";
					btn.disabled = false; return;
				}
			} else if (role === 'korepetytor') {
				finalTutorId = currentProfile.id;
				finalStudentId = document.getElementById("bStudentId")?.value;
				if (!finalStudentId) {
					alert("Musisz wybrać ucznia z listy!");
					btn.textContent = "Dodaj lekcję do grafiku →";
					btn.disabled = false; return;
				}
				if (!isAssigned(finalStudentId, finalTutorId)) {
					alert("Możesz dodawać lekcje tylko dla przypisanych uczniów.");
					btn.textContent = "Dodaj lekcję do grafiku →";
					btn.disabled = false; return;
				}
			} else if (role === 'uczen') {
				finalStudentId = currentProfile.id;
				finalTutorId = document.getElementById("bTutorId")?.value;
				if (!finalTutorId) {
					alert("Musisz wybrać korepetytora z listy!");
					btn.textContent = "Wyślij prośbę o lekcję →";
					btn.disabled = false; return;
				}
				if (!isAssigned(finalStudentId, finalTutorId)) {
					alert("Możesz rezerwować tylko u przypisanego korepetytora.");
					btn.textContent = "Wyślij prośbę o lekcję →";
					btn.disabled = false; return;
				}
			}

			const dur = parseInt(document.getElementById("bDur")?.value || 60);
			const notes = document.getElementById("bNotes")?.value || "";
			const datetimeString = `${dateVal}T${timeVal}:00`;

			const status = (role === 'admin' || role === 'korepetytor') ? "zaplanowana" : "oczekuje";
			const price = dur === 60 ? 100 : (dur === 90 ? 140 : 180);

			const { error } = await supabaseClient.from("lessons").insert({
				student_id: finalStudentId,
				tutor_id: finalTutorId,
				subject: subject,
				date: datetimeString,
				duration_minutes: dur,
				status: status,
				notes: notes,
				price: price,
				paid: false,
				paid_at: null,
			});

			if (error) {
				alert("❌ Błąd rezerwacji: " + error.message);
				btn.textContent = role === 'uczen' ? "Wyślij prośbę o lekcję →" : "Dodaj lekcję do grafiku →";
				btn.disabled = false;
			} else {
				alert(status === "zaplanowana" ? "✅ Lekcja pomyślnie dodana do grafiku!" : "✅ Prośba wysłana! Pojawi się u korepetytora.");
				await loadRealData();
				showPanel(role === 'uczen' ? "lessons" : "all-lessons");
			}
		}

		// ── INICJALIZACJA ──
		async function init() {
			await initSupabase();
			const profile = await getCurrentProfile();
			if (!profile) {
				window.location.href = "login.html";
				return;
			}
			currentProfile = profile;
			const initStr = (profile.full_name || "?")
				.split(" ")
				.map((w) => w[0])
				.join("")
				.slice(0, 2)
				.toUpperCase();

			document.getElementById("userAvatar").textContent = initStr;
			document.getElementById("userName").textContent =
				profile.full_name || profile.email;
			document.getElementById("userRole").textContent = profile.role;

			// Pobranie prawdziwych danych z bazy zamiast DEMO!
			await loadRealData();

			buildNav(profile.role);
			showPanel("overview");
		}
		// --- ZARZĄDZANIE OPŁATAMI (ADMIN) ---

		window.showPaymentsList = function () {
			viewingPaymentUserId = null;
			viewingPaymentPair = null;
			showPanel(currentProfile.role === "admin" ? "all-payments" : "payments");
		};

		window.refreshPayments = function () {
			showPanel(currentProfile.role === "admin" ? "all-payments" : "payments");
		};

		window.openUserPayments = function (studentId, tutorId) {
			viewingPaymentUserId = studentId;
			viewingPaymentPair = tutorId ? { studentId, tutorId } : null;
			expandedPaymentLessonIds = [];
			showPanel("all-payments");
		};

		window.togglePaymentLesson = function (lessonId) {
			expandedPaymentLessonIds = expandedPaymentLessonIds.includes(lessonId)
				? expandedPaymentLessonIds.filter((id) => id !== lessonId)
				: [...expandedPaymentLessonIds, lessonId];
			document.getElementById("dashMain").innerHTML = panelpayments();
		};

		window.togglePaymentStudent = function (studentId) {
			expandedPaymentStudentIds = expandedPaymentStudentIds.includes(studentId)
				? expandedPaymentStudentIds.filter((id) => id !== studentId)
				: [...expandedPaymentStudentIds, studentId];
			document.getElementById("dashMain").innerHTML = panelpayments();
		};

		window.toggleAdminStudentNotes = function (studentId) {
			expandedAdminStudentIds = expandedAdminStudentIds.includes(studentId)
				? expandedAdminStudentIds.filter((id) => id !== studentId)
				: [...expandedAdminStudentIds, studentId];
			document.getElementById("dashMain").innerHTML = panelStudents();
		};

		window.toggleTutorStudent = function (studentId) {
			expandedTutorStudentIds = expandedTutorStudentIds.includes(studentId)
				? expandedTutorStudentIds.filter((id) => id !== studentId)
				: [...expandedTutorStudentIds, studentId];
			document.getElementById("dashMain").innerHTML = panelStudents();
		};

		window.toggleAssignmentStudent = function (studentId) {
			expandedAssignmentStudentIds = expandedAssignmentStudentIds.includes(studentId)
				? expandedAssignmentStudentIds.filter((id) => id !== studentId)
				: [...expandedAssignmentStudentIds, studentId];
			document.getElementById("dashMain").innerHTML = panelAdminOverview();
		};

		window.refreshAdminOverviewRange = function () {
			const start = document.getElementById("adminRangeStart")?.value;
			const end = document.getElementById("adminRangeEnd")?.value;
			const target = document.getElementById("adminRangeSummary");
			if (!target) return;
			target.innerHTML = moneySummaryHtml(summarizeLessonsByDate(start, end));
		};

		window.showAllLessonsList = function () {
			viewingLessonsUserId = null;
			showPanel("all-lessons");
		};

		window.setAllLessonsUserFilter = function (filter) {
			allLessonsUserFilter = filter || "all";
			viewingLessonsUserId = null;
			showPanel("all-lessons");
		};

		window.setUserLessonsSort = function (sortKey) {
			userLessonsSort = sortKey || "date-asc";
			showPanel("all-lessons");
		};

		window.openUserLessons = function (userId) {
			viewingLessonsUserId = userId;
			showPanel("all-lessons");
		};

		window.openStudentLessons = function (studentId) {
			viewingLessonsUserId = studentId;
			showPanel("all-lessons");
		};

		window.toggleStudentTutorAssignment = async function (studentId, tutorId, checked) {
			let error;
			if (checked) {
				({ error } = await supabaseClient
					.from("student_tutor_assignments")
					.upsert({ student_id: studentId, tutor_id: tutorId }, { onConflict: "student_id,tutor_id" }));
			} else {
				({ error } = await supabaseClient
					.from("student_tutor_assignments")
					.delete()
					.eq("student_id", studentId)
					.eq("tutor_id", tutorId));
			}
			if (error) {
				alert("Blad zapisu przypisania: " + error.message + "\nUruchom SQL z supabase-config.js, jesli tabela jeszcze nie istnieje.");
			}
			await loadRealData();
			showPanel("overview");
		};

		window.toggleNewPayPaidAt = function () {
			const paid = document.getElementById("newPayPaid").value === "true";
			const el = document.getElementById("newPayPaidAt");
			el.disabled = !paid;
			if (paid && !el.value) el.value = toInputDate(new Date().toISOString());
			if (!paid) el.value = "";
		};

		window.togglePayPaidAt = function (lessonId) {
			const paid = document.getElementById(`pay-paid-${lessonId}`).value === "true";
			const el = document.getElementById(`pay-paidat-${lessonId}`);
			el.disabled = !paid;
			if (paid && !el.value) el.value = toInputDate(new Date().toISOString());
			if (!paid) el.value = "";
		};

		window.addPaymentLesson = async function () {
			if (!viewingPaymentUserId) return;
			const msg = document.getElementById("newPayMsg");
			const subject = document.getElementById("newPaySubject").value.trim() || "Lekcja";
			const price = parseFloat(document.getElementById("newPayPrice").value);
			const date = document.getElementById("newPayDate").value;
			const time = document.getElementById("newPayTime").value;
			const paid = document.getElementById("newPayPaid").value === "true";
			const paidAtVal = document.getElementById("newPayPaidAt").value;
			const status = document.getElementById("newPayHeld")?.value || "odbyta";

			if (!date || !time || isNaN(price)) {
				msg.textContent = "⚠️ Uzupełnij datę, godzinę i kwotę.";
				return;
			}

			msg.textContent = "Dodawanie…";
			const defaultTutor = viewingPaymentPair?.tutorId || (appData.users || []).find((u) => u.role === "korepetytor")?.id || null;
			const payload = {
				student_id: viewingPaymentUserId,
				tutor_id: defaultTutor,
				subject,
				date: `${date}T${time}:00`,
				duration_minutes: 60,
				status,
				price,
				paid,
				paid_at: paid && paidAtVal ? new Date(paidAtVal).toISOString() : null,
			};

			const { error } = await supabaseClient.from("lessons").insert(payload);
			if (error) {
				msg.textContent = "❌ Błąd: " + error.message;
			} else {
				msg.textContent = "✅ Dodano pozycję.";
				await loadRealData();
				refreshPayments();
			}
		};

		window.savePaymentLesson = async function (lessonId) {
			const subject = document.getElementById(`pay-subject-${lessonId}`).value.trim() || "Lekcja";
			const date = document.getElementById(`pay-date-${lessonId}`).value;
			const time = document.getElementById(`pay-time-${lessonId}`).value;
			const price = parseFloat(document.getElementById(`pay-price-${lessonId}`).value);
			const paid = document.getElementById(`pay-paid-${lessonId}`).value === "true";
			const paidAtVal = document.getElementById(`pay-paidat-${lessonId}`).value;
			const status = document.getElementById(`pay-status-${lessonId}`)?.value || "odbyta";

			if (!date || !time || isNaN(price)) {
				alert("⚠️ Uzupełnij datę, godzinę i kwotę.");
				return;
			}

			const { error } = await supabaseClient
				.from("lessons")
				.update({
					subject,
					date: `${date}T${time}:00`,
					price,
					status,
					paid,
					paid_at: paid && paidAtVal ? new Date(paidAtVal).toISOString() : null,
				})
				.eq("id", lessonId);

			if (error) {
				alert("❌ Błąd zapisu: " + error.message);
			} else {
				await loadRealData();
				refreshPayments();
			}
		};

		window.deletePaymentLesson = async function (lessonId) {
			if (!confirm("Usunąć tę pozycję rozliczeniową z bazy?")) return;
			const { error } = await supabaseClient.from("lessons").delete().eq("id", lessonId);
			if (error) {
				alert("❌ Błąd usuwania: " + error.message);
			} else {
				await loadRealData();
				refreshPayments();
			}
		};

		// Zmiana statusu opłacenia lekcji (korepetytor / uczeń)
		window.changePaymentStatus = async function (lessonId, selectElement) {
			const isPaid = (selectElement.value === 'true');
			selectElement.disabled = true;

			const { data, error } = await supabaseClient
				.from("lessons")
				.update({ paid: isPaid })
				.eq("id", lessonId)
				.select();

			if (error) {
				alert("❌ Błąd aktualizacji: " + error.message);
				selectElement.disabled = false;
				selectElement.value = (!isPaid).toString();
			} else if (!data || data.length === 0) {
				alert("❌ Baza odrzuciła zapis (brak uprawnień RLS).");
				selectElement.disabled = false;
				selectElement.value = (!isPaid).toString();
			} else {
				const lessonIndex = appData.lessons.findIndex((l) => l.id === lessonId);
				if (lessonIndex !== -1) {
					appData.lessons[lessonIndex].paid = isPaid;
				}
				refreshPayments();
			}
		};

		// Trwałe usuwanie lekcji z bazy (tylko dla admina)
		window.deleteLesson = async function (lessonId) {
			if (
				!confirm(
					"⚠️ UWAGA! Czy na pewno chcesz TRWALE USUNĄĆ tę lekcję z bazy danych? Tej operacji nie można cofnąć!",
				)
			)
				return;

			const { error } = await supabaseClient
				.from("lessons")
				.delete()
				.eq("id", lessonId);

			if (error) {
				alert("❌ Błąd usuwania: " + error.message);
			} else {
				alert("✅ Lekcja została bezpowrotnie usunięta z bazy.");
				await loadRealData();
				showPanel("all-lessons"); // Odśwież widok wszystkich lekcji
			}
		};

		// Oznaczanie lekcji jako "odbyta" (aby wpadła do zakładki Opłaty)
		window.markAsDone = async function (lessonId) {
			if (
				!confirm(
					"Oznaczyć tę lekcję jako zakończoną? Pojawi się wtedy w zakładce Opłaty.",
				)
			)
				return;

			const { error } = await supabaseClient
				.from("lessons")
				.update({ status: "odbyta" })
				.eq("id", lessonId);

			if (error) {
				alert("❌ Błąd: " + error.message);
			} else {
				await loadRealData();
				showPanel("all-lessons");
			}
		};
		// Uruchomienie
		init();
