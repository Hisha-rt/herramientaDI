const MathEngine = {
    timeToMins(timeStr) {
        const [h, m] = timeStr.split(':').map(Number);
        return h * 60 + m;
    },
    
    minsToTime(mins) {
        const totalMins = Math.round(mins);
        const h = Math.floor(totalMins / 60).toString().padStart(2, '0');
        const m = (totalMins % 60).toString().padStart(2, '0');
        return `${h}:${m}`;
    },

    // Interpolación Cúbica Monótona 
    createMonotoneSpline(points) {
        points.sort((a, b) => a.x - b.x);
        const n = points.length;

        if (n < 2) {
            const baseVal = points[0]?.y ?? 60;
            return {
                points, tangents: [0],
                evaluate: () => baseVal, getDerivative: () => 0
            };
        }

        const secants = [];
        for (let i = 0; i < n - 1; i++) {
            const dx = points[i + 1].x - points[i].x;
            secants.push(dx === 0 ? 0 : (points[i + 1].y - points[i].y) / dx);
        }

        const tangents = new Array(n).fill(0);
        tangents[0] = secants[0];
        tangents[n - 1] = secants[n - 2];

        for (let i = 1; i < n - 1; i++) {
            if (secants[i - 1] * secants[i] > 0) {
                tangents[i] = 2 / ((1 / secants[i - 1]) + (1 / secants[i]));
            } else {
                tangents[i] = 0;
            }
        }

        return {
            points, tangents,
            evaluate(x) {
                if (x <= points[0].x) return points[0].y;
                if (x >= points[n - 1].x) return points[n - 1].y;

                let i = 0;
                while (i < n - 1 && x > points[i + 1].x) i++;
                
                const p0 = points[i], p1 = points[i + 1];
                const m0 = tangents[i], m1 = tangents[i + 1];
                const dx = p1.x - p0.x;
                if (dx === 0) return p0.y;

                const t = (x - p0.x) / dx;
                const h00 = 2 * t * t * t - 3 * t * t + 1;
                const h10 = t * t * t - 2 * t * t + t;
                const h01 = -2 * t * t * t + 3 * t * t;
                const h11 = t * t * t - t * t;

                const y = h00 * p0.y + h10 * dx * m0 + h01 * p1.y + h11 * dx * m1;
                return Math.max(0, Math.min(100, y));
            },
            getDerivative(x) {
                const h = 0.1;
                return (this.evaluate(x + h) - this.evaluate(x - h)) / (2 * h);
            }
        };
    },

   // Genera perfil de 24 hrs eliminando las mesetas (líneas planas)
    buildDailyProfile(activities) {
        const points = [{ x: 0, y: 60, color: '#aaaaaa' }]; // Base a las 00:00
        
        const sorted = [...activities].sort((a, b) => this.timeToMins(a.start) - this.timeToMins(b.start));
        let lastMins = 0;
        let lastEnergy = 60;

        sorted.forEach(act => {
            const startMins = this.timeToMins(act.start);
            const endMins = this.timeToMins(act.end);
            
            let energyAtStart = lastEnergy;

            // 1. Curvar los huecos libres: Evitamos la línea recta haciendo que tienda a 60
            if (startMins > lastMins) {
                const idleHours = (startMins - lastMins) / 60;
                // La energía regresa lentamente a su estado base (60)
                energyAtStart = lastEnergy + (60 - lastEnergy) * Math.min(0.8, idleHours * 0.15);
                // Pequeña fluctuación para asegurar que NUNCA sea perfectamente horizontal
                energyAtStart += (Math.random() * 4 - 2); 
                energyAtStart = Math.max(5, Math.min(95, energyAtStart));
                
                points.push({ x: startMins, y: energyAtStart, color: act.color });
            } else if (points.length > 0) {
                // Si están pegadas, solo actualizamos el color para que empiece el nuevo tramo
                points[points.length - 1].color = act.color;
            }

            // 2. Curvas pronunciadas en la actividad
            const duration = endMins - startMins;
            if (duration > 45) {
                // Si la actividad es larga, metemos un punto intermedio para generar una comba fuerte
                const midMins = startMins + (duration / 2);
                let midEnergy = (energyAtStart + act.energyEnd) / 2;
                
                // Si recarga, sube de golpe al inicio; si cansa, cae de golpe
                const curveOffset = act.impact === 'recarga' ? 15 : -15;
                midEnergy = Math.max(5, Math.min(95, midEnergy + curveOffset + (Math.random() * 6 - 3)));
                
                points.push({ x: midMins, y: midEnergy, color: act.color });
            }
            
            // Punto final de la actividad (inicia el color gris de inactividad)
            points.push({ x: endMins, y: act.energyEnd, color: '#aaaaaa' });
            
            lastMins = endMins;
            lastEnergy = act.energyEnd;
        });

        // 3. Completar el resto del día hasta las 24:00 con una suave caída/subida
        if (lastMins < 1440) {
            const idleHours = (1440 - lastMins) / 60;
            let finalEnergy = lastEnergy + (60 - lastEnergy) * Math.min(0.8, idleHours * 0.15);
            finalEnergy += (Math.random() * 4 - 2);
            points.push({ x: 1440, y: Math.max(5, Math.min(95, finalEnergy)), color: '#aaaaaa' });
        }

        return this.createMonotoneSpline(points);
    },

    calculateRiemannSums(spline, startX, endX, numBars) {
        const width = (endX - startX) / numBars;
        let totalArea = 0;
        const bars = [];
        
        for (let i = 0; i < numBars; i++) {
            const x = startX + i * width;
            const midX = x + width / 2;
            const h = spline.evaluate(midX); 
            totalArea += h * width;
            bars.push({ x, w: width, h });
        }
        
        const exactitude = Math.min(99.9, 50 + (numBars / 96) * 50);
        return { totalArea, bars, exactitude };
    },

    // ----------------------------------------------------------------------
    // Generador Dinámico de Polinomios (Trampas de signos y posiciones aleatorias)
    // ----------------------------------------------------------------------
    generateExercise(activities) {
        if (!activities || activities.length === 0) return null;
        
        const act = activities[Math.floor(Math.random() * activities.length)];
        const startH = Math.floor(this.timeToMins(act.start) / 60);
        let endH = Math.ceil(this.timeToMins(act.end) / 60);
        if (endH <= startH) endH = startH + 1;
        const horaPregunta = startH;

        // 1. Grado aleatorio: 50% Cuadrática, 50% Cúbica
        const isCubic = Math.random() > 0.5;

        // 2. Coeficientes (Diseñados para que la integral sea 100% entera)
        const sign = () => Math.random() > 0.5 ? 1 : -1;
        // x^3 -> múltiplo de 4
        const d = isCubic ? (Math.floor(Math.random() * 2) + 1) * 4 * sign() : 0; 
        // x^2 -> múltiplo de 3
        const a = (Math.floor(Math.random() * 3) + 1) * 3 * sign(); 
        // x^1 -> múltiplo de 2
        const b = (Math.floor(Math.random() * 4) + 1) * 2 * sign(); 
        // Constante x^0
        const c = Math.floor(Math.random() * 50) + 10; 

        // 3. Crear array de términos y barajar su orden
        let terms = [
            { coef: d, power: 3 },
            { coef: a, power: 2 },
            { coef: b, power: 1 },
            { coef: c, power: 0 }
        ].filter(t => t.coef !== 0);
        
        terms.sort(() => Math.random() - 0.5);

        // 4. Formatear la ecuación del problema con "Trampas de Leyes de los Signos"
        const formatTermWithTricks = (coef, power, index) => {
            const pStr = power === 0 ? '' : power === 1 ? 'x' : power === 2 ? 'x²' : 'x³';
            const abs = Math.abs(coef);
            const num = (abs === 1 && power !== 0) ? '' : abs;
            const isFirst = index === 0;
            const rand = Math.random();
            
            if (coef > 0) {
                if (rand < 0.35 && !isFirst) return `- (-${num}${pStr})`; // Trampa: doble negativo
                return isFirst ? `${num}${pStr}` : `+ ${num}${pStr}`;
            } else {
                if (rand < 0.30 && !isFirst) return `+ (-${num}${pStr})`; // Trampa: sumar un negativo
                if (rand >= 0.30 && rand < 0.60 && !isFirst) return `- (+${num}${pStr})`; // Trampa: restar un positivo explícito
                return isFirst ? `-${num}${pStr}` : `- ${num}${pStr}`;
            }
        };

        const funcionFx = terms.map((t, i) => formatTermWithTricks(t.coef, t.power, i)).join(' ');

        // 5. Preparar la Derivada (Se ordena canónicamente para la respuesta)
        let derTerms = [
            { coef: d * 3, power: 2 },
            { coef: a * 2, power: 1 },
            { coef: b, power: 0 }
        ].filter(t => t.coef !== 0);
        
        derTerms.sort((x, y) => y.power - x.power);

        const formatClean = (coef, power, isFirst) => {
            const pStr = power === 0 ? '' : power === 1 ? 'x' : power === 2 ? 'x²' : 'x³';
            const abs = Math.abs(coef);
            const num = (abs === 1 && power !== 0) ? '' : abs;
            if (coef > 0) return isFirst ? `${num}${pStr}` : `+ ${num}${pStr}`;
            return isFirst ? `-${num}${pStr}` : `- ${num}${pStr}`;
        };

        const funcionDerivada = derTerms.length > 0 
            ? derTerms.map((t, i) => formatClean(t.coef, t.power, i === 0)).join(' ')
            : '0';

        const velocidadEnHora = (d * 3 * Math.pow(horaPregunta, 2)) + (a * 2 * horaPregunta) + b;

        // 6. Preparar la Integral
        let intTerms = [
            { coef: d / 4, power: 4 },
            { coef: a / 3, power: 3 },
            { coef: b / 2, power: 2 },
            { coef: c, power: 1 }
        ].filter(t => t.coef !== 0);
        
        intTerms.sort((x, y) => y.power - x.power);

        const formatIntClean = (coef, power, isFirst) => {
            const powers = ['','x','x²','x³','x⁴'];
            const pStr = powers[power];
            const abs = Math.abs(coef);
            const num = (abs === 1 && power !== 0) ? '' : abs;
            if (coef > 0) return isFirst ? `${num}${pStr}` : `+ ${num}${pStr}`;
            return isFirst ? `-${num}${pStr}` : `- ${num}${pStr}`;
        };

        const antiderivada = intTerms.map((t, i) => formatIntClean(t.coef, t.power, i === 0)).join(' ');
        
        const evalF = (x) => (d/4 * Math.pow(x, 4)) + (a/3 * Math.pow(x, 3)) + (b/2 * Math.pow(x, 2)) + (c * x);
        const areaExacta = evalF(endH) - evalF(startH);

        return {
            actividad: act.name,
            horaInicio: startH,
            horaFin: endH,
            horaPregunta,
            funcionFx,
            impacto: act.impact,
            preguntas: {
                derivada: `Encuentra la derivada f'(x) simplificando primero los signos y acomodando los términos, luego evalúala en x = ${horaPregunta}. ¿A qué velocidad cambiaba tu energía a las ${horaPregunta}:00?`,
                integral: `Calcula la integral definida ∫ f(x) dx desde x = ${startH} hasta x = ${endH}. (Recomendación: simplifica y ordena el polinomio primero).`
            },
            respuestas: {
                derivada: `f'(x) = ${funcionDerivada}. En x = ${horaPregunta}, la velocidad era de ${velocidadEnHora} puntos/hora.`,
                integral: `F(x) = ${antiderivada}. Evaluando de ${startH} a ${endH}: F(${endH}) - F(${startH}) = ${areaExacta} puntos acumulados.`
            }
        };
    }
};