document.addEventListener('DOMContentLoaded', async () => {
    const canvas = document.getElementById('energyCanvas');
    const ctx = canvas.getContext('2d');
    
    let currentSpline = null;
    let mode = 'derivada'; // 'derivada' | 'integral' | 'ejercicios'
    let activities = [];

    // Ajustar DPI del Canvas para pantallas HD
    function resizeCanvas() {
        const rect = canvas.parentElement.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);
        drawScene();
    }
    window.addEventListener('resize', resizeCanvas);

    // Sistema Principal
    async function loadDataAndRender() {
        activities = await DBService.getActivities();
        currentSpline = MathEngine.buildDailyProfile(activities);
        updateHistoryTable();
        updateSpeedometer(parseInt(document.getElementById('timeSlider').value, 10));
        updatePanels();
    }

    // Dibujado del Canvas
    function drawScene() {
        if (!currentSpline) return;
        const dpr = window.devicePixelRatio || 1;
        const W = canvas.width / dpr;
        const H = canvas.height / dpr;
        
        ctx.clearRect(0, 0, W, H);
        
        // Cuadrícula y Etiquetas 24h
        ctx.strokeStyle = '#333';
        ctx.fillStyle = '#fff';
        ctx.font = '12px sans-serif';
        ctx.lineWidth = 1;
        
        for (let i = 0; i <= 24; i += 2) {
            const x = (i * 60 / 1440) * W;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, H);
            ctx.stroke();
            ctx.fillText(`${i.toString().padStart(2, '0')}:00`, x + 5, H - 5);
        }

        // Modo Integral (Barras debajo de la curva)
        if (mode === 'integral') {
            const startMins = MathEngine.timeToMins(document.getElementById('intStart').value);
            const endMins = MathEngine.timeToMins(document.getElementById('intEnd').value);
            const numBars = parseInt(document.getElementById('barsSlider').value, 10);
            
            if (endMins > startMins) {
                const riemann = MathEngine.calculateRiemannSums(currentSpline, startMins, endMins, numBars);
                
                riemann.bars.forEach(bar => {
                    const cx = (bar.x / 1440) * W;
                    const cw = (bar.w / 1440) * W;
                    const ch = (bar.h / 100) * (H * 0.8); 
                    
                    ctx.fillStyle = 'rgba(76, 175, 80, 0.4)';
                    ctx.fillRect(cx, H - ch, Math.max(1, cw - 1), ch);
                    ctx.strokeStyle = '#4CAF50';
                    ctx.strokeRect(cx, H - ch, Math.max(1, cw - 1), ch);
                });
                
                document.getElementById('intAreaText').innerText = `Reserva de energía: ${(riemann.totalArea / 100).toFixed(0)} puntos sostenidos`;
                document.getElementById('intPrecisionText').innerText = `Precisión: ${riemann.exactitude.toFixed(1)}% ${riemann.exactitude > 95 ? '(¡Casi exacto!)' : '(Sobran huecos sin medir)'}`;
            } else {
                document.getElementById('intAreaText').innerText = 'Reserva de energía: 0 puntos';
                document.getElementById('intPrecisionText').innerText = 'La hora final ("A") debe ser mayor que la inicial ("De").';
            }
        }

        // Curva Suavizada Principal
        ctx.lineWidth = 5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        for (let i = 0; i < currentSpline.points.length - 1; i++) {
            const p1 = currentSpline.points[i];
            const p2 = currentSpline.points[i + 1];
            ctx.strokeStyle = p1.color || '#fff';
            
            ctx.beginPath();
            for (let x = p1.x; x <= p2.x; x += 5) {
                const px = (x / 1440) * W;
                const py = H - (currentSpline.evaluate(x) / 100) * (H * 0.8);
                if (x === p1.x) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            }
            ctx.stroke();
        }

        // Modo Derivada (Línea Tangente)
        if (mode === 'derivada') {
            const min = parseInt(document.getElementById('timeSlider').value, 10);
            const energy = currentSpline.evaluate(min);
            const slope = currentSpline.getDerivative(min);
            
            const px = (min / 1440) * W;
            const py = H - (energy / 100) * (H * 0.8);
            
            // Punto actual
            ctx.beginPath();
            ctx.arc(px, py, 8, 0, Math.PI * 2);
            ctx.fillStyle = '#fff';
            ctx.fill();
            ctx.strokeStyle = '#ff9800';
            ctx.lineWidth = 3;
            ctx.stroke();

            // Tangente (m)
            const tangentLength = 80;
            const visualSlope = -slope * (H * 0.8 / 100) / (W / 1440);
            const dx = tangentLength / Math.sqrt(1 + visualSlope * visualSlope);
            const dy = visualSlope * dx;

            ctx.beginPath();
            ctx.moveTo(px - dx, py - dy);
            ctx.lineTo(px + dx, py + dy);
            ctx.strokeStyle = '#f44336';
            ctx.setLineDash([5, 5]);
            ctx.lineWidth = 3;
            ctx.stroke();
            ctx.setLineDash([]);
        }
    }

    // Actualización del Velocímetro (Derivada)
    function updateSpeedometer(mins) {
        if (!currentSpline) return;
        document.getElementById('lblTime').innerText = MathEngine.minsToTime(mins);
        
        const slope = currentSpline.getDerivative(mins);
        const card = document.getElementById('speedometer');
        const text = document.getElementById('speedText');
        
        card.className = 'speedometer card ' + (slope > 0.05 ? 'speed-pos' : slope < -0.05 ? 'speed-neg' : 'speed-zero');
        
        if (slope > 0.05) {
            text.innerText = `↗ ¡Recargando pilas! Ganas ${(slope * 60).toFixed(1)} puntos/hr.`;
        } else if (slope < -0.05) {
            text.innerText = `↘ ¡Gastando energía! Pierdes ${(-slope * 60).toFixed(1)} puntos/hr.`;
        } else {
            text.innerText = '→ Cima o Valle. Tu energía dejó de subir o bajar (Pendiente ≈ 0).';
        }
    }

    document.getElementById('timeSlider').addEventListener('input', (e) => {
        updateSpeedometer(parseInt(e.target.value, 10));
        drawScene();
    });

    // Eventos Formulario (Crear / Editar con validación)
    document.getElementById('activityForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const editId = document.getElementById('actId').value || null;
        const startStr = document.getElementById('actStart').value;
        const endStr = document.getElementById('actEnd').value;
        const startMins = MathEngine.timeToMins(startStr);
        const endMins = MathEngine.timeToMins(endStr);
        
        if (startMins >= endMins) {
            alert('La hora de fin debe ser mayor a la hora de inicio.');
            return;
        }

        const existingActs = await DBService.getActivities();

        // Validar que no se traslape con otra actividad
        const hasOverlap = existingActs.some(a => {
            if (editId && a.id === editId) return false;
            const aStart = MathEngine.timeToMins(a.start);
            const aEnd = MathEngine.timeToMins(a.end);
            return startMins < aEnd && endMins > aStart;
        });

        if (hasOverlap) {
            alert('Ese horario se empalma con otra actividad ya registrada.');
            return;
        }

        const impact = document.querySelector('input[name="actImpact"]:checked').value;
        const previousVersion = editId ? existingActs.find(a => a.id === editId) : null;
        let finalEnergy;

        // Conservar energía al editar si no cambió el tipo de impacto
        if (previousVersion && previousVersion.impact === impact) {
            finalEnergy = previousVersion.energyEnd;
        } else {
            let currentEnergy = 60; // Base 00:00
            let latestEnd = 0;

            existingActs.forEach(a => {
                if (editId && a.id === editId) return;
                const aEnd = MathEngine.timeToMins(a.end);
                if (aEnd <= startMins && aEnd >= latestEnd) {
                    currentEnergy = a.energyEnd;
                    latestEnd = aEnd;
                }
            });

            if (impact === 'recarga') {
                const minVal = Math.min(100, currentEnergy + 5);
                finalEnergy = Math.floor(Math.random() * (100 - minVal + 1)) + minVal;
            } else {
                const maxVal = Math.max(0, currentEnergy - 5);
                finalEnergy = Math.floor(Math.random() * (maxVal + 1));
            }
        }

        const act = {
            id: editId,
            name: document.getElementById('actName').value.trim(),
            color: document.getElementById('actColor').value,
            start: startStr,
            end: endStr,
            impact,
            energyEnd: finalEnergy
        };

        await DBService.saveActivity(act);
        document.getElementById('activityForm').reset();
        document.getElementById('actId').value = '';
        loadDataAndRender();
    });

    // Gestión CRUD UI
    function updateHistoryTable() {
        const list = document.getElementById('activityList');
        list.innerHTML = '';
        [...activities]
            .sort((a, b) => MathEngine.timeToMins(a.start) - MathEngine.timeToMins(b.start))
            .forEach(act => {
                const div = document.createElement('div');
                div.className = 'activity-item';
                div.style.borderLeftColor = act.color;
                div.innerHTML = `
                    <span><strong>${act.name}</strong> (${act.start} - ${act.end}) · ⚡${act.energyEnd}</span>
                    <div class="activity-actions">
                        <button type="button" onclick="window.editAct('${act.id}')" title="Editar">✏️</button>
                        <button type="button" onclick="window.deleteAct('${act.id}')" title="Eliminar">❌</button>
                    </div>
                `;
                list.appendChild(div);
            });
    }

    window.editAct = (id) => {
        const act = activities.find(a => a.id === id);
        if (!act) return;
        document.getElementById('actId').value = act.id;
        document.getElementById('actName').value = act.name;
        document.getElementById('actColor').value = act.color;
        document.getElementById('actStart').value = act.start;
        document.getElementById('actEnd').value = act.end;
        const radio = document.querySelector(`input[name="actImpact"][value="${act.impact}"]`);
        if (radio) radio.checked = true;
    };

    window.deleteAct = async (id) => {
        await DBService.deleteActivity(id);
        loadDataAndRender();
    };

    // Pestañas del Laboratorio
    const tabDerivada = document.getElementById('tabDerivada');
    const tabIntegral = document.getElementById('tabIntegral');
    const tabEjercicios = document.getElementById('tabEjercicios');

    tabDerivada.addEventListener('click', () => { mode = 'derivada'; updatePanels(); });
    tabIntegral.addEventListener('click', () => { mode = 'integral'; updatePanels(); });
    tabEjercicios.addEventListener('click', () => { mode = 'ejercicios'; updatePanels(); });

    function updatePanels() {
        document.getElementById('panelDerivada').classList.toggle('hidden', mode !== 'derivada');
        document.getElementById('panelIntegral').classList.toggle('hidden', mode !== 'integral');
        document.getElementById('panelEjercicios').classList.toggle('hidden', mode !== 'ejercicios');
        
        tabDerivada.className = mode === 'derivada' ? 'active' : '';
        tabIntegral.className = mode === 'integral' ? 'active' : '';
        tabEjercicios.className = mode === 'ejercicios' ? 'active ejercicios-btn' : 'ejercicios-btn';
        
        drawScene();
    }

    // Controles Integral y Demos
    document.getElementById('barsSlider').addEventListener('input', drawScene);
    document.getElementById('intStart').addEventListener('change', drawScene);
    document.getElementById('intEnd').addEventListener('change', drawScene);

    document.getElementById('btnEscuela').addEventListener('click', () => { DBService.loadDemo('escuela'); loadDataAndRender(); });
    document.getElementById('btnSabado').addEventListener('click', () => { DBService.loadDemo('sabado'); loadDataAndRender(); });

    // Búsqueda de máximos y mínimos (Botones Derivada)
    const jumpToPoint = (type) => {
        if (!currentSpline) return;
        let targetMin = 0;
        let targetVal = type === 'max' ? -1 : 101;
        
        for (let i = 0; i < 1440; i++) {
            const val = currentSpline.evaluate(i);
            if (type === 'max' && val > targetVal) { targetVal = val; targetMin = i; }
            if (type === 'min' && val < targetVal) { targetVal = val; targetMin = i; }
        }
        const slider = document.getElementById('timeSlider');
        slider.value = targetMin;
        slider.dispatchEvent(new Event('input'));
    };

    document.getElementById('btnPico').addEventListener('click', () => jumpToPoint('max'));
    document.getElementById('btnValle').addEventListener('click', () => jumpToPoint('min'));

    // Generador de Ejercicios f(x)
    document.getElementById('btnGenerarEjercicio').addEventListener('click', () => {
        if (activities.length === 0) {
            alert('¡Primero necesitas registrar algunas actividades en tu diario!');
            return;
        }

        const ejercicio = MathEngine.generateExercise(activities);
        if (!ejercicio) return;

        document.getElementById('ejercicioCard').classList.remove('hidden');
        document.getElementById('respuestasSecretas').classList.add('hidden');
        document.getElementById('btnMostrarRespuestas').classList.remove('hidden');

        const accion = ejercicio.impacto === 'recarga' ? 'recargando' : 'gastando';
        document.getElementById('ejercicioContexto').innerText = `Mientras estabas "${ejercicio.actividad}" entre las ${ejercicio.horaInicio}:00 y las ${ejercicio.horaFin}:00, tu energía se estaba ${accion} siguiendo esta fórmula:`;
        
        document.getElementById('ejercicioFuncion').innerText = ejercicio.funcionFx;
        document.getElementById('preguntaDerivada').innerText = ejercicio.preguntas.derivada;
        document.getElementById('preguntaIntegral').innerText = ejercicio.preguntas.integral;
        
        document.getElementById('respuestaDerivada').innerHTML = `<strong>Derivada:</strong> ${ejercicio.respuestas.derivada}`;
        document.getElementById('respuestaIntegral').innerHTML = `<strong>Integral:</strong> ${ejercicio.respuestas.integral}`;
    });

    document.getElementById('btnMostrarRespuestas').addEventListener('click', (e) => {
        document.getElementById('respuestasSecretas').classList.remove('hidden');
        e.target.classList.add('hidden');
    });

    // Exportar / Importar JSON
    document.getElementById('btnExportar').addEventListener('click', async () => {
        const data = await DBService.exportData();
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'energia.json';
        a.click();
        URL.revokeObjectURL(url);
    });

    document.getElementById('btnImportar').addEventListener('click', () => document.getElementById('fileImport').click());
    document.getElementById('fileImport').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (ev) => {
            try {
                JSON.parse(ev.target.result);
                await DBService.importData(ev.target.result);
                loadDataAndRender();
            } catch {
                alert('El archivo seleccionado no es un JSON válido.');
            }
        };
        reader.readAsText(file);
    });

    // Init
    resizeCanvas();
    loadDataAndRender();
});