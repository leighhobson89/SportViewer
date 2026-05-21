import { createActivitySkeleton, finalizeActivity, normalizeSport } from './database.js';

let garminFitSdkModulePromise = null;
let legacyFitParserConstructorPromise = null;
let legacyFitParserScriptPromise = null;

function toScalar(value) {
    if (!Array.isArray(value)) {
        return value;
    }

    return value.find((item) => item !== null && item !== undefined && item !== '') ?? value[0] ?? null;
}

function numberOrNull(value) {
    const scalarValue = toScalar(value);
    if (scalarValue === null || scalarValue === undefined || scalarValue === '') {
        return null;
    }

    const numericValue = Number(scalarValue);
    return Number.isFinite(numericValue) ? numericValue : null;
}

function dateOrNull(value) {
    const scalarValue = toScalar(value);
    if (!scalarValue) {
        return null;
    }

    const date = new Date(scalarValue);
    return Number.isNaN(date.getTime()) ? null : date;
}

function getFirstNonNull(...values) {
    for (const rawValue of values) {
        const value = toScalar(rawValue);
        if (value !== null && value !== undefined && value !== '') {
            return value;
        }
    }

    return null;
}

function toArray(value) {
    if (Array.isArray(value)) {
        return value;
    }
    if (value === null || value === undefined) {
        return [];
    }

    return [value];
}

function normalizeDistanceKm(value) {
    const numericValue = numberOrNull(value);
    if (numericValue === null) {
        return 0;
    }

    return numericValue > 1000 ? numericValue / 1000 : numericValue;
}

function semicirclesToDegrees(value) {
    const numericValue = numberOrNull(value);
    if (numericValue === null) {
        return null;
    }

    return Math.abs(numericValue) > 180 ? numericValue * (180 / 2147483648) : numericValue;
}

function normalizeGarminSpeedKmh(value) {
    const numericValue = numberOrNull(value);
    return numericValue === null ? null : numericValue * 3.6;
}

function normalizeLegacySpeedKmh(value) {
    return numberOrNull(value);
}

function inferRecordDistanceScale(records, sessionDistanceKm, selector) {
    const lastDistanceValue = [...records]
        .reverse()
        .map((record) => numberOrNull(selector(record)))
        .find((value) => value !== null);

    if (lastDistanceValue === null) {
        return 1;
    }

    if (sessionDistanceKm > 0) {
        const kmDifference = Math.abs(lastDistanceValue - sessionDistanceKm);
        const meterDifference = Math.abs((lastDistanceValue / 1000) - sessionDistanceKm);
        return kmDifference <= meterDifference ? 1000 : 1;
    }

    return lastDistanceValue > 1000 ? 1 : 1000;
}

function guessSportFromFilename(filename) {
    const lowerFilename = String(filename || '').toLowerCase();
    if (lowerFilename.includes('run')) {
        return 'Run';
    }
    if (lowerFilename.includes('ride') || lowerFilename.includes('cycle') || lowerFilename.includes('bike')) {
        return 'Ride';
    }
    if (lowerFilename.includes('walk')) {
        return 'Walk';
    }
    if (lowerFilename.includes('hike')) {
        return 'Hike';
    }
    if (lowerFilename.includes('swim')) {
        return 'Swim';
    }

    return 'Unknown';
}

function stemFilename(filename) {
    return String(filename || '').replace(/\.[^.]+$/, '');
}

function loadScript(url) {
    if (!legacyFitParserScriptPromise) {
        legacyFitParserScriptPromise = new Promise((resolve, reject) => {
            const scriptElement = document.createElement('script');
            scriptElement.src = url;
            scriptElement.async = true;
            scriptElement.onload = () => resolve();
            scriptElement.onerror = () => reject(new Error('Unable to load fallback FIT parser library'));
            document.head.appendChild(scriptElement);
        });
    }

    return legacyFitParserScriptPromise;
}

async function getGarminFitSdkModule() {
    if (!garminFitSdkModulePromise) {
        garminFitSdkModulePromise = (async () => {
            try {
                return await import('https://esm.sh/@garmin/fitsdk@21.205.0');
            } catch {
                return import('https://cdn.jsdelivr.net/npm/@garmin/fitsdk@21.205.0/+esm');
            }
        })();
    }

    return garminFitSdkModulePromise;
}

async function getLegacyFitParserConstructor() {
    if (window.FitParser?.default || window.FitParser) {
        return window.FitParser?.default || window.FitParser;
    }

    if (!legacyFitParserConstructorPromise) {
        legacyFitParserConstructorPromise = (async () => {
            try {
                const fitParserModule = await import('https://cdn.jsdelivr.net/npm/fit-file-parser@2.3.2/+esm');
                return fitParserModule.default || fitParserModule.FitParser || fitParserModule;
            } catch (moduleError) {
                await loadScript('https://cdn.jsdelivr.net/npm/fit-file-parser@2.3.2/dist/fit-file-parser.js');
                if (window.FitParser?.default || window.FitParser) {
                    return window.FitParser?.default || window.FitParser;
                }
                throw moduleError;
            }
        })();
    }

    return legacyFitParserConstructorPromise;
}

function parseWithLegacyFitParser(parser, arrayBuffer) {
    if (typeof parser.parseAsync === 'function') {
        return parser.parseAsync(arrayBuffer);
    }

    return new Promise((resolve, reject) => {
        parser.parse(arrayBuffer, (error, data) => {
            if (error) {
                reject(error);
                return;
            }

            resolve(data);
        });
    });
}

async function decodeWithGarminSdk(arrayBuffer) {
    const { Decoder, Stream } = await getGarminFitSdkModule();
    const stream = Stream.fromByteArray(Array.from(new Uint8Array(arrayBuffer)));
    const decoder = new Decoder(stream);

    if (typeof decoder.isFIT === 'function' && !decoder.isFIT()) {
        throw new Error('Invalid FIT file');
    }

    return decoder.read({
        applyScaleAndOffset: true,
        expandSubFields: true,
        expandComponents: true,
        convertTypesToStrings: true,
        convertDateTimesToDates: true,
        includeUnknownData: true,
        mergeHeartRates: true,
        decodeMemoGlobs: true,
        legacyArrayMode: false
    });
}

function getMessageArray(messages, candidateKeys, keyFragment) {
    for (const key of candidateKeys) {
        if (Array.isArray(messages?.[key])) {
            return messages[key];
        }
    }

    const entry = Object.entries(messages || {}).find(([key, value]) => Array.isArray(value) && key.toLowerCase().includes(keyFragment.toLowerCase()));
    return entry?.[1] || [];
}

function getLegacySession(parsedFit) {
    return parsedFit?.sessions?.[0]
        || parsedFit?.activity?.sessions?.[0]
        || parsedFit?.session
        || parsedFit?.activity?.session
        || null;
}

function getLegacyRecords(parsedFit) {
    const directRecords = parsedFit?.records
        || parsedFit?.activity?.records
        || parsedFit?.record
        || [];

    if (Array.isArray(directRecords) && directRecords.length) {
        return directRecords;
    }

    const sessions = toArray(parsedFit?.sessions || parsedFit?.session || parsedFit?.activity?.sessions || parsedFit?.activity?.session);
    const sessionRecords = sessions.flatMap((session) => toArray(session?.records || session?.record));
    if (sessionRecords.length) {
        return sessionRecords;
    }

    return sessions.flatMap((session) => toArray(session?.laps || session?.lap).flatMap((lap) => toArray(lap?.records || lap?.record)));
}

function hasUsefulPoints(points) {
    return points.some((point) => point.lat !== null || point.lon !== null || point.ele !== null || point.hr !== null || point.cadence !== null || point.power !== null);
}

function isUsableActivity(activity) {
    return hasUsefulPoints(activity.points)
        || activity.distanceKm > 0
        || activity.elevationGainM > 0
        || activity.elevationLossM > 0
        || activity.avgHeartRate !== null
        || activity.avgCadence !== null
        || activity.avgPower !== null;
}

function buildGarminActivity({ filename, messages, errors }) {
    const sessions = getMessageArray(messages, ['sessionMesgs'], 'session');
    const laps = getMessageArray(messages, ['lapMesgs'], 'lap');
    const activities = getMessageArray(messages, ['activityMesgs'], 'activity');
    const fileIds = getMessageArray(messages, ['fileIdMesgs'], 'fileid');
    const records = getMessageArray(messages, ['recordMesgs'], 'record');
    const session = sessions[0] || laps[0] || activities[0] || null;

    const activity = createActivitySkeleton({
        filename,
        sourceFormat: 'fit'
    });

    activity.name = String(getFirstNonNull(
        session?.name,
        activities[0]?.name,
        fileIds[0]?.productName,
        stemFilename(filename)
    ) || '').trim();

    activity.sport = normalizeSport(getFirstNonNull(
        session?.sport,
        session?.subSport,
        activities[0]?.sport,
        guessSportFromFilename(filename)
    ));

    activity.startTime = dateOrNull(getFirstNonNull(
        session?.startTime,
        session?.timestamp,
        activities[0]?.timestamp,
        fileIds[0]?.timeCreated,
        records[0]?.timestamp
    ));

    activity.distanceKm = normalizeDistanceKm(getFirstNonNull(
        session?.totalDistance,
        session?.distance,
        laps[0]?.totalDistance,
        activities[0]?.totalDistance
    ));

    activity.durationSec = numberOrNull(getFirstNonNull(
        session?.totalElapsedTime,
        activities[0]?.totalElapsedTime
    )) || 0;

    activity.movingTimeSec = numberOrNull(getFirstNonNull(
        session?.totalTimerTime,
        session?.movingTime,
        activities[0]?.totalTimerTime
    )) || 0;

    activity.elevationGainM = numberOrNull(getFirstNonNull(
        session?.totalAscent,
        laps[0]?.totalAscent
    )) || 0;

    activity.elevationLossM = numberOrNull(getFirstNonNull(
        session?.totalDescent,
        laps[0]?.totalDescent
    )) || 0;

    activity.avgSpeedKmh = normalizeGarminSpeedKmh(getFirstNonNull(
        session?.enhancedAvgSpeed,
        session?.avgSpeed
    )) || 0;

    activity.maxSpeedKmh = normalizeGarminSpeedKmh(getFirstNonNull(
        session?.enhancedMaxSpeed,
        session?.maxSpeed
    )) || 0;

    activity.avgHeartRate = numberOrNull(getFirstNonNull(session?.avgHeartRate));
    activity.maxHeartRate = numberOrNull(getFirstNonNull(session?.maxHeartRate));
    activity.avgCadence = numberOrNull(getFirstNonNull(session?.avgCadence));
    activity.maxCadence = numberOrNull(getFirstNonNull(session?.maxCadence));
    activity.avgPower = numberOrNull(getFirstNonNull(session?.avgPower, session?.normalizedPower));
    activity.maxPower = numberOrNull(getFirstNonNull(session?.maxPower));
    activity.calories = numberOrNull(getFirstNonNull(session?.totalCalories, session?.calories));

    const distanceScale = inferRecordDistanceScale(records, activity.distanceKm, (record) => getFirstNonNull(record.distance, record.totalDistance));
    activity.points = records.map((record) => ({
        lat: semicirclesToDegrees(getFirstNonNull(record.positionLat, record.position_lat, record.latitude)),
        lon: semicirclesToDegrees(getFirstNonNull(record.positionLong, record.positionLon, record.position_long, record.longitude)),
        ele: numberOrNull(getFirstNonNull(record.enhancedAltitude, record.altitude, record.enhanced_altitude)),
        time: dateOrNull(getFirstNonNull(record.timestamp, record.time, record.dateTime)),
        hr: numberOrNull(getFirstNonNull(record.heartRate, record.heart_rate, record.hr)),
        cadence: numberOrNull(getFirstNonNull(record.cadence, record.cad)),
        power: numberOrNull(getFirstNonNull(record.power, record.watts)),
        temperature: numberOrNull(getFirstNonNull(record.temperature, record.temp)),
        speedKmh: normalizeGarminSpeedKmh(getFirstNonNull(record.enhancedSpeed, record.speed)),
        distanceFromStartM: (() => {
            const recordDistance = numberOrNull(getFirstNonNull(record.distance, record.totalDistance));
            return recordDistance === null ? null : recordDistance * distanceScale;
        })(),
        elapsedSec: numberOrNull(getFirstNonNull(record.elapsedTime, record.timerTime))
    }));

    if (!records.length && !session) {
        activity.issues.push('No FIT session or record messages found');
    }
    if (Array.isArray(errors) && errors.length && !activity.points.length) {
        activity.issues.push(String(errors[0]?.message || errors[0]));
    }

    return finalizeActivity(activity);
}

function buildLegacyActivity({ filename, parsedFit }) {
    const session = getLegacySession(parsedFit);
    const records = Array.isArray(getLegacyRecords(parsedFit)) ? getLegacyRecords(parsedFit) : [];
    const activity = createActivitySkeleton({
        filename,
        sourceFormat: 'fit'
    });

    activity.name = String(getFirstNonNull(
        session?.name,
        parsedFit?.name,
        parsedFit?.activity?.name,
        stemFilename(filename)
    ) || '').trim();

    activity.sport = normalizeSport(getFirstNonNull(
        session?.sport,
        session?.sub_sport,
        parsedFit?.sport,
        parsedFit?.activity?.sport,
        guessSportFromFilename(filename)
    ));

    activity.startTime = dateOrNull(getFirstNonNull(
        session?.start_time,
        session?.startTime,
        parsedFit?.activity?.timestamp,
        parsedFit?.timestamp,
        records[0]?.timestamp
    ));

    activity.distanceKm = normalizeDistanceKm(getFirstNonNull(
        session?.total_distance,
        session?.distance,
        parsedFit?.total_distance
    ));

    activity.durationSec = numberOrNull(getFirstNonNull(
        session?.total_elapsed_time,
        session?.totalElapsedTime,
        parsedFit?.total_elapsed_time
    )) || 0;

    activity.movingTimeSec = numberOrNull(getFirstNonNull(
        session?.total_timer_time,
        session?.moving_time,
        session?.totalTimerTime,
        parsedFit?.total_timer_time
    )) || 0;

    activity.elevationGainM = numberOrNull(getFirstNonNull(session?.total_ascent, session?.totalAscent)) || 0;
    activity.elevationLossM = numberOrNull(getFirstNonNull(session?.total_descent, session?.totalDescent)) || 0;
    activity.avgSpeedKmh = normalizeLegacySpeedKmh(getFirstNonNull(session?.avg_speed, session?.enhanced_avg_speed, session?.avgSpeed, parsedFit?.avg_speed)) || 0;
    activity.maxSpeedKmh = normalizeLegacySpeedKmh(getFirstNonNull(session?.max_speed, session?.enhanced_max_speed, session?.maxSpeed, parsedFit?.max_speed)) || 0;
    activity.avgHeartRate = numberOrNull(getFirstNonNull(session?.avg_heart_rate, session?.avgHeartRate));
    activity.maxHeartRate = numberOrNull(getFirstNonNull(session?.max_heart_rate, session?.maxHeartRate));
    activity.avgCadence = numberOrNull(getFirstNonNull(session?.avg_cadence, session?.avgCadence));
    activity.maxCadence = numberOrNull(getFirstNonNull(session?.max_cadence, session?.maxCadence));
    activity.avgPower = numberOrNull(getFirstNonNull(session?.avg_power, session?.avgPower));
    activity.maxPower = numberOrNull(getFirstNonNull(session?.max_power, session?.maxPower));
    activity.calories = numberOrNull(getFirstNonNull(session?.total_calories, session?.calories, parsedFit?.calories));

    const distanceScale = inferRecordDistanceScale(records, activity.distanceKm, (record) => getFirstNonNull(record.distance, record.total_distance, record.totalDistance));
    activity.points = records.map((record) => ({
        lat: semicirclesToDegrees(getFirstNonNull(record.position_lat, record.positionLat, record.latitude)),
        lon: semicirclesToDegrees(getFirstNonNull(record.position_long, record.positionLong, record.positionLon, record.longitude)),
        ele: numberOrNull(getFirstNonNull(record.enhanced_altitude, record.enhancedAltitude, record.altitude)),
        time: dateOrNull(getFirstNonNull(record.timestamp, record.time, record.date_time)),
        hr: numberOrNull(getFirstNonNull(record.heart_rate, record.heartRate, record.hr)),
        cadence: numberOrNull(getFirstNonNull(record.cadence, record.cad, record.avg_cadence)),
        power: numberOrNull(getFirstNonNull(record.power, record.watts)),
        temperature: numberOrNull(getFirstNonNull(record.temperature, record.temp)),
        speedKmh: normalizeLegacySpeedKmh(getFirstNonNull(record.enhanced_speed, record.enhancedSpeed, record.speed)),
        distanceFromStartM: (() => {
            const recordDistance = numberOrNull(getFirstNonNull(record.distance, record.total_distance, record.totalDistance));
            return recordDistance === null ? null : recordDistance * distanceScale;
        })(),
        elapsedSec: numberOrNull(getFirstNonNull(record.elapsed_time, record.elapsedTime))
    }));

    if (!records.length && !session) {
        activity.issues.push('No FIT session or records found');
    }

    return finalizeActivity(activity);
}

export async function parseFitFile({ filename, arrayBuffer }) {
    let garminError = null;

    try {
        const garminResult = await decodeWithGarminSdk(arrayBuffer);
        const garminActivity = buildGarminActivity({
            filename,
            messages: garminResult?.messages || {},
            errors: garminResult?.errors || []
        });

        if (isUsableActivity(garminActivity)) {
            return garminActivity;
        }

        garminError = new Error('Garmin FIT SDK returned no usable route or sensor records');
    } catch (error) {
        garminError = error;
    }

    const FitParser = await getLegacyFitParserConstructor();
    const parser = new FitParser({
        force: true,
        speedUnit: 'km/h',
        lengthUnit: 'km',
        temperatureUnit: 'celsius',
        elapsedRecordField: true,
        mode: 'list'
    });

    const parsedFit = await parseWithLegacyFitParser(parser, arrayBuffer);
    const fallbackActivity = buildLegacyActivity({ filename, parsedFit });
    if (garminError && !isUsableActivity(fallbackActivity)) {
        fallbackActivity.issues.push(garminError?.message || 'Primary FIT decoder failed');
    }

    return fallbackActivity;
}
