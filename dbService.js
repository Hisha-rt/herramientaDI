const DBService = {
    key: 'energia_db_v1',
    apiUrl: 'http://localhost:3000/api/activities', // URL base para futuro backend REST

    // Simula una petición GET (Preparado para REST)
    async getActivities() {
        // --- Versión REST ---
        // const res = await fetch(this.apiUrl);
        // return await res.json();

        const data = localStorage.getItem(this.key);
        return data ? JSON.parse(data) : [];
    },

    // Simula POST / PUT
    async saveActivity(act) {
        // --- Versión REST ---
        // const method = act.id ? 'PUT' : 'POST';
        // const url = act.id ? `${this.apiUrl}/${act.id}` : this.apiUrl;
        // await fetch(url, {
        //     method,
        //     headers: { 'Content-Type': 'application/json' },
        //     body: JSON.stringify(act)
        // });
        // return;

        let acts = await this.getActivities();
        if (act.id) {
            acts = acts.map(a => a.id === act.id ? act : a);
        } else {
            act.id = Date.now().toString();
            acts.push(act);
        }
        localStorage.setItem(this.key, JSON.stringify(acts));
    },

    // Simula DELETE
    async deleteActivity(id) {
        // --- Versión REST ---
        // await fetch(`${this.apiUrl}/${id}`, { method: 'DELETE' });
        // return;

        let acts = await this.getActivities();
        acts = acts.filter(a => a.id !== id);
        localStorage.setItem(this.key, JSON.stringify(acts));
    },

    async importData(jsonData) {
        const parsed = JSON.parse(jsonData);
        if (!Array.isArray(parsed)) {
            throw new Error('El formato del archivo debe ser una lista de actividades.');
        }
        localStorage.setItem(this.key, JSON.stringify(parsed));
    },

    async exportData() {
        return localStorage.getItem(this.key) || '[]';
    },

    loadDemo(type) {
        const base = [
            { id: '1', name: 'Dormir', color: '#3f51b5', start: '00:00', end: '07:00', impact: 'recarga', energyEnd: 95 },
            { id: '2', name: 'Desayuno', color: '#ff9800', start: '07:00', end: '07:30', impact: 'recarga', energyEnd: 100 },
        ];
        
        let extra = [];
        if (type === 'escuela') {
            extra = [
                { id: '3', name: 'Clases (Cansa la mente)', color: '#f44336', start: '08:00', end: '14:00', impact: 'cansa', energyEnd: 40 },
                { id: '4', name: 'Comida', color: '#8bc34a', start: '14:30', end: '15:30', impact: 'recarga', energyEnd: 75 },
                { id: '5', name: 'Tarea', color: '#9c27b0', start: '16:00', end: '18:00', impact: 'cansa', energyEnd: 50 },
            ];
        } else {
            extra = [
                { id: '3', name: 'Fútbol', color: '#4caf50', start: '09:00', end: '11:00', impact: 'cansa', energyEnd: 30 },
                { id: '4', name: 'Almuerzo Gigante', color: '#ff5722', start: '11:30', end: '12:30', impact: 'recarga', energyEnd: 90 },
                { id: '5', name: 'Videojuegos', color: '#00bcd4', start: '13:00', end: '18:00', impact: 'cansa', energyEnd: 60 },
            ];
        }
        
        localStorage.setItem(this.key, JSON.stringify([...base, ...extra]));
    }
};