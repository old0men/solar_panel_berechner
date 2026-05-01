async function showDailyEnergyEntries() {

    const tableBody = document.getElementById('tableBody');
    const statsBar = document.getElementById('statsBar');


    try {
        const response = await fetch('/api/calculations');

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        const calculations = data.calculations || [];


        if (!calculations || calculations.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="6" class="empty">Keine Berechnungen gefunden</td></tr>';
            statsBar.innerHTML = '';
            return;
        }

        // Filter for daily calculations only
        const dailyCalculations = calculations.filter(calc =>
            calc.input?.trueCalcType === 'daily'
        );


        console.log(`filter list daily: ${dailyCalculations.length}`)
        console.log(...dailyCalculations)
        console.log("......................................")


        const momentCalculations = calculations.filter(calc =>
            calc.input?.trueCalcType === 'moment'
        )

        console.log(`filter list moment: ${momentCalculations.length}`)
        console.log(...momentCalculations)
        console.log("......................................")

        if (dailyCalculations.length === 0 && momentCalculations.length === 0) {
            console.log('No daily calculations found');
            return;
        }

        // Loop through every daily calculation and show energy
        console.log(`Found ${dailyCalculations.length} daily calculation(s):\n`);

        let groupId = 0;
        let dailyGroup = new Map();

        dailyCalculations.forEach((calc, index) => {
            if (index === 0) {
                groupId = calc.id
            }

            const check = calc.id - calc.input?.hour
            if (groupId > check) {
                groupId = calc.id - calc.input?.specificHour
            }

            const energyWh = calc.result?.energyWh;
            const energy = calc.result?.energy;
            const power = calc.result?.power;
            const hour = calc.input?.hour;
            const specificHour = calc.input?.specificHour;
            const date = new Date(calc.createdAt);
            const formattedDate = date.toLocaleString('de-DE', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });

            if (!dailyGroup.has(groupId)) {
                dailyGroup.set(groupId, {
                    id: calc.id,
                    power: [],
                    input: {...calc.input}
                })
            }

            const group = dailyGroup.get(groupId);
            group.power.push(power);

        });

        const momentGroup = new Map()
        let counter = 0

        momentCalculations.forEach((calc, index) => {
            if (counter >= 0) {
                const power = calc.result?.power;
                const hour = calc.input?.hour;
                const specificHour = calc.input?.specificHour;
                const date = new Date(calc.createdAt);
                const formattedDate = date.toLocaleString('de-DE', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });

                if (hour === specificHour) {
                    if (!momentGroup.has(calc.id)) {
                        momentGroup.set(calc.id, {
                            id: calc.id,
                            power: [],
                            input: {...calc.input}
                        })
                    }

                    const group = momentGroup.get(calc.id);
                    group.power.push(power);

                    counter += calc.specificHour
                }
            } else {
                counter -= 1
            }
        })

        const displayCalculationsDaily = Array.from(dailyGroup.values());
        const displayCalculationsMoment = Array.from(momentGroup.values());

        const displayCalculations = [...displayCalculationsDaily, ...displayCalculationsMoment];
        console.log(displayCalculations)

        displayCalculations.sort((a, b) => a.id - b.id);

        tableBody.innerHTML = '';

        displayCalculations.forEach((group, index) => {

            const row = tableBody.insertRow();

            let id = group.id
            let power = group.power
            let calcType = group.input?.trueCalcType
            let type = group.input?.type

            row.insertCell(0).textContent = (index + 1).toString();
            row.insertCell(1).innerHTML = calcType
            row.insertCell(2).innerHTML = `<span class="badge">${type}</span>`;
            row.insertCell(3).textContent = ((power.reduce((sum, item) => sum +item)).toFixed(2)).toString();
        })


    } catch (error) {
        console.error('Error loading daily energy entries:', error);
    }
}

document.addEventListener('DOMContentLoaded', function() {
    showDailyEnergyEntries();

    const deleteAccountBtn = document.getElementById('deleteAccountBtn');
    if (deleteAccountBtn) {
        deleteAccountBtn.addEventListener('click', async function() {
            await deleteUserAccount();
        });
    }
});

async function deleteUserAccount() {
    const userConfirmed = confirm(
        'ACHTUNG: Möchten Sie Ihr Konto wirklich löschen?\n\n' +
        'Diese Aktion ist ENDGÜLTIG und kann nicht rückgängig gemacht werden.\n' +
        'Alle Ihre Daten und Berechnungen werden unwiderruflich gelöscht.\n\n' +
        'Klicken Sie "OK" um fortzufahren oder "Abbrechen".'
    );

    if (!userConfirmed) return;

    const secondConfirm = confirm(
        'Letzte Warnung: Ihr Konto und ALLE damit verbundenen Daten werden PERMANENT gelöscht.\n\n' +
        'Sind Sie ABSOLUT sicher?'
    );

    if (!secondConfirm) return;

    const deleteBtn = document.getElementById('deleteAccountBtn');
    const originalText = deleteBtn.innerHTML;
    deleteBtn.innerHTML = 'Lösche Konto...';
    deleteBtn.disabled = true;

    try {
        const response = await fetch('/api/users/me', {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
            }
        });

        if (response.ok) {
            alert('Ihr Konto wurde erfolgreich gelöscht.');
            window.location.href = '/';
        } else if (response.status === 401) {
            alert('Sie sind nicht angemeldet.');
        } else {
            alert(`Fehler: ${response.statusText}`);
        }
    } catch (error) {
        alert(`Netzwerkfehler: ${error.message}`);
    } finally {
        deleteBtn.innerHTML = originalText;
        deleteBtn.disabled = false;
    }
}

// Make loadHistory function globally available
window.loadHistory = showDailyEnergyEntries;