// импорты библиотек
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// определение мобильного устройства для настройки зума
const isMobile = /Mobi|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
    || window.matchMedia('(pointer: coarse)').matches;
const INITIAL_ZOOM_DESKTOP = 2.6;
const INITIAL_ZOOM_MOBILE = 1.5;
const INITIAL_ZOOM = isMobile ? INITIAL_ZOOM_MOBILE : INITIAL_ZOOM_DESKTOP;

// конфигурация модели
const GLB_URL = './glbs/2ndfloor.glb';
const DIAGONAL_MARGIN = 2.0;
const FRUSTUM_MARGIN = 1.0;
const FIXED_AZIMUTH = 0;
const FIXED_POLAR = 0.9472;

// настройки api
const API_BASE_URL = 'https://api.example.com';
const SCHEDULE_ENDPOINT = '/schedule';
const WEEK_SCHEDULE_PAGE_URL = 'week_schedule.html';

// описание кабинетов по идентификаторам в модели
const roomConfig = {
    '6419': { number: '', name: 'Пожарная лестница', showPanel: true },
    '6417': { number: 'Ж', name: 'Туалет', showPanel: true },
    '6415': { number: 'М', name: 'Туалет', showPanel: true },
    '6413': { number: '', name: 'no info', showPanel: true },
    '6435': { number: '', name: 'Подсобное помещение', showPanel: false },
    '6431': { number: '', name: 'Лестничная площадка', showPanel: true },
    '6411': { number: '214', name: 'АХО', showPanel: true },
    '6409': { number: '213', name: 'Приемная директора', showPanel: true },
    '6407': { number: '212', name: 'Кабинет директора', showPanel: true },
    '6423': { number: '211', name: 'Приемная комиссия', showPanel: true },
    '6425': { number: '210', name: 'Заместитель директора по УВР', showPanel: true },
    '6427': { number: '209', name: 'Аудитория (ПК)', showPanel: true },
    '6443': { number: '208', name: 'Актовый зал', showPanel: true },
    '6439': { number: '207', name: 'Спортивный зал', showPanel: true },
    '6441': { number: '206', name: 'Лаборатория', showPanel: true },
    '6437': { number: '205', name: 'Студенческий отдел кадров (СОК)', showPanel: true },
    '6393': { number: '204', name: 'подсобное помещение', showPanel: true },
    '6400': { number: '203', name: 'Раздевалка', showPanel: true },
    '6433': { number: '202', name: 'Гардеробная', showPanel: true },
    '6429': { number: '201', name: 'Коворкинг', showPanel: true },
    // комната ground_1 не показывает панель
    'ground_1': { number: '', name: 'No info', showPanel: false }
};

// резервный массив (не используется, если конфиг задан)
const roomConfigByIndex = [];

// глобальное состояние приложения
let currentGroup = null;
let currentSchedule = [];
let highlightedMeshes = [];
let selectedMesh = null;
let activeHighlightedMesh = null;
let currentDate = new Date().toISOString().slice(0, 10);
let currentFloor = 2;
// ссылка на загруженную модель — нужна кнопке «Сбросить вид»
let loadedModel = null;
// true, если расписание свернулось, чтобы показать кабинет.
// По нему кнопка «Назад» понимает, что ей есть куда возвращаться.
let scheduleCollapsedForRoom = false;

// ссылки на dom-элементы
const container = document.getElementById('model-container');
const modelLoading = document.getElementById('model-loading');
const clickInfoDiv = document.getElementById('click-info');
const sidebarToggle = document.getElementById('sidebar-toggle');
const sidebar = document.getElementById('sidebar');
const groupSelect = document.getElementById('group-select');
const pairsContainer = document.getElementById('pairs-container');
const roomPanel = document.getElementById('room-panel');
const roomPanelClose = document.getElementById('room-panel-close');
const roomPanelBack = document.getElementById('room-panel-back');
const roomPanelTitle = document.getElementById('room-panel-title');
const roomPanelContent = document.getElementById('room-panel-content');
const dateInput = document.getElementById('date-input');
const prevDayBtn = document.getElementById('prev-day');
const nextDayBtn = document.getElementById('next-day');
const weekDetailsBtn = document.getElementById('week-details-btn');
const stubOverlay = document.getElementById('stub-overlay');
const floorNumbers = document.querySelectorAll('.floor-numbers span');

dateInput.value = currentDate;

// инициализация three.js сцены
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf5f2ea);
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
camera.position.set(0, 10, 0);
camera.lookAt(0, 0, 0);

// создание рендерера и добавление его в контейнер
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.setPixelRatio(window.devicePixelRatio);
container.appendChild(renderer.domElement);

// добавление освещения
scene.add(new THREE.AmbientLight(0xffffff, 0.7));
const dirLight = new THREE.DirectionalLight(0xffffff, 1);
dirLight.position.set(10, 20, 10);
scene.add(dirLight);

// настройка управления камерой
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.1;
controls.screenSpacePanning = true;
controls.enableZoom = true;
controls.zoomSpeed = 1.2;
controls.enableRotate = true;
controls.minPolarAngle = 0;
controls.maxPolarAngle = Math.PI / 2;
controls.enablePan = true;
controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
controls.update();

// на мобильных отключаем вращение, оставляем панорамирование и зум
if (isMobile) {
    controls.enableRotate = false;
    controls.touches.ONE = THREE.TOUCH.PAN;
    controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
}
controls.update();

// инициализация raycaster для обработки кликов
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let roomMeshes = [];
const pointerDownPos = new THREE.Vector2();
let isPointerDown = false;
const DRAG_THRESHOLD = 5;

// загрузка glb-модели
const loader = new GLTFLoader();
loader.load(
    GLB_URL,
    (gltf) => {
        const model = gltf.scene;
        loadedModel = model;
        scene.add(model);

        // собираем все меши в массив
        model.traverse((child) => {
            if (child.isMesh) roomMeshes.push(child);
        });

        // сопоставляем каждый меш с конфигурацией кабинета
        roomMeshes.forEach((mesh, index) => {
            let config = null;
            let roomId = null;
            const name = mesh.name || '';

            for (const id in roomConfig) {
                if (name.includes(id)) {
                    config = roomConfig[id];
                    roomId = id;
                    break;
                }
            }
            if (!config && roomConfigByIndex[index]) {
                config = roomConfigByIndex[index];
                roomId = config.number || `index_${index}`;
            }

            if (config) {
                mesh.userData.roomId = roomId;
                mesh.userData.roomNumber = config.number;
                mesh.userData.roomName = config.name;
                mesh.userData.showPanel = config.showPanel;
            } else {
                mesh.userData.roomId = roomId || `unknown_${index}`;
                mesh.userData.roomNumber = '';
                mesh.userData.roomName = name || `Объект ${index}`;
                mesh.userData.showPanel = false;
            }

            // клонируем материал, чтобы можно было менять цвет индивидуально
            if (mesh.material) {
                mesh.material = Array.isArray(mesh.material)
                    ? mesh.material.map((mat) => mat.clone())
                    : mesh.material.clone();
            }
        });

        // подгоняем камеру под модель и запускаем анимацию
        fitCameraToModel(model);
        resetAllRoomsToWhite();
        modelLoading.classList.add('hidden');
        animate();
    },
    undefined,
    (error) => {
        console.error('Ошибка загрузки модели:', error);
        modelLoading.querySelector('.spinner').style.display = 'none';
        modelLoading.querySelector('p').textContent = 'Не удалось загрузить план этажа. Обновите страницу.';
    }
);

// функция подгонки камеры под размеры модели
function fitCameraToModel(model) {
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const diagonal = Math.sqrt(size.x ** 2 + size.y ** 2 + size.z ** 2);

    model.position.sub(center);
    controls.target.set(0, 0, 0);

    // вычисляем позицию камеры с учётом фиксированных углов
    const camDistance = diagonal * DIAGONAL_MARGIN + 10;
    const polar = FIXED_POLAR;
    const azimuth = FIXED_AZIMUTH;
    camera.position.set(
        camDistance * Math.sin(polar) * Math.sin(azimuth),
        camDistance * Math.cos(polar),
        camDistance * Math.sin(polar) * Math.cos(azimuth)
    );
    camera.lookAt(controls.target);

    // настраиваем ортографическую камеру под размеры модели
    const frustumSize = diagonal * FRUSTUM_MARGIN;
    const aspect = container.clientWidth / container.clientHeight;
    camera.left = -frustumSize * aspect / 2;
    camera.right = frustumSize * aspect / 2;
    camera.top = frustumSize / 2;
    camera.bottom = -frustumSize / 2;
    camera.near = 0.1;
    camera.far = diagonal * 10 + 1000;
    camera.zoom = INITIAL_ZOOM;
    camera.updateProjectionMatrix();
    controls.update();
}

// вспомогательная функция получения строки даты в формате iso
function getDateString(date) {
    return date.toISOString().slice(0, 10);
}

// запрос расписания с сервера (или фолбэк при ошибке)
async function fetchSchedule(group, dateStr = currentDate) {
    if (currentFloor !== 2) return [];
    try {
        const url = `${API_BASE_URL}${SCHEDULE_ENDPOINT}?group=${encodeURIComponent(group)}&date=${dateStr}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Ошибка HTTP: ${response.status}`);
        const data = await response.json();
        return data.schedule || [];
    } catch (err) {
        console.error('Не удалось загрузить расписание, используется фолбэк:', err);
        return [
            { time: '09:00 - 10:30', name: 'Математика', roomId: '209', teacher: 'Иванов И.И.' },
            { time: '10:40 - 12:10', name: 'Физика', roomId: '208', teacher: 'Петров П.П.' },
            { time: '14:00 - 15:30', name: 'Информатика', roomId: '207', teacher: 'Сидоров С.С.' }
        ];
    }
}

// определение статуса пары (прошла, идёт, предстоит)
function getPairStatus(pair) {
    const now = new Date();
    const [startStr, endStr] = pair.time.split(' - ');
    const [startH, startM] = startStr.split(':').map(Number);
    const [endH, endM] = endStr.split(':').map(Number);
    const start = new Date(`${currentDate}T${String(startH).padStart(2, '0')}:${String(startM).padStart(2, '0')}:00`);
    const end = new Date(`${currentDate}T${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}:00`);
    if (now < start) return 'upcoming';
    if (now >= start && now <= end) return 'current';
    return 'past';
}

// обновление списка пар в нижней панели
function updatePairsUI(schedule) {
    pairsContainer.innerHTML = '';
    if (schedule.length === 0) {
        pairsContainer.innerHTML = '<div class="no-pairs">На выбранную дату пар нет</div>';
        return;
    }
    schedule.forEach((pair) => {
        const card = document.createElement('div');
        card.className = `pair-card ${getPairStatus(pair)}`;
        card.dataset.roomId = pair.roomId;
        card.innerHTML = `
            <div class="pair-time">${pair.time}</div>
            <div class="pair-name">${pair.name}</div>
            <div class="pair-room">Каб. ${pair.roomId}</div>
            <div class="pair-teacher">${pair.teacher || 'Преподаватель не указан'}</div>
        `;
        pairsContainer.appendChild(card);
    });
}

// подсветка кабинетов, в которых есть пары
function highlightRoomsForSchedule(schedule) {
    resetActiveSelection();
    highlightedMeshes = [];
    resetAllRoomsToWhite();

    schedule.forEach((pair) => {
        const status = getPairStatus(pair);
        if (status === 'past') return;
        const mesh = roomMeshes.find((m) => m.userData.roomNumber === pair.roomId);
        if (mesh && mesh.userData.showPanel) {
            mesh.userData.pairStatus = status;
            animateMeshColor(mesh, getStatusColor(status, 'normal'));
            highlightedMeshes.push(mesh);
        }
    });
}

// подсветка конкретного кабинета по его номеру (например, при клике на карточку пары)
function highlightRoomByRoomId(roomId) {
    resetActiveSelection();

    const mesh = roomMeshes.find((m) => m.userData.roomNumber === roomId);
    if (!mesh || !mesh.userData.showPanel) {
        hideRoomPanel();
        clickInfoDiv.textContent = 'Клик: объект без информации';
        return;
    }

    if (highlightedMeshes.includes(mesh)) {
        const status = mesh.userData.pairStatus;
        if (status && status !== 'past') {
            animateMeshColor(mesh, getStatusColor(status, 'bright'));
            activeHighlightedMesh = mesh;
        }
    } else {
        animateMeshColor(mesh, COLOR_SELECTED);
        selectedMesh = mesh;
    }

    clickInfoDiv.textContent = `Клик: ${mesh.userData.roomName}`;
    showRoomPanel(mesh.userData.roomNumber || '', mesh.userData.roomName);
}

// обработчик клика по карточке пары
pairsContainer.addEventListener('click', (event) => {
    const card = event.target.closest('.pair-card');
    if (!card) return;
    const roomId = card.dataset.roomId;
    if (roomId) {
        highlightRoomByRoomId(roomId);
    }
});

// применение выбранной группы: загрузка и отображение расписания
async function applyGroup(selectedGroup) {
    currentGroup = selectedGroup;
    const schedule = await fetchSchedule(selectedGroup, currentDate);
    currentSchedule = schedule;
    updatePairsUI(schedule);
    highlightRoomsForSchedule(schedule);
    // список пар изменился — шторка стала выше или ниже,
    // пересчитываем её высоту для карточки кабинета
    updateSheetHeight();
}

// обновление интерфейса при смене даты
function refreshForDateChange() {
    if (currentGroup) {
        applyGroup(currentGroup);
    } else {
        currentSchedule = [];
        updatePairsUI([]);
        resetAllRoomsToWhite(true);
        hideRoomPanel();
    }
}

// палитра цветов и параметры анимации
const COLOR_WHITE = 0xffffff;
const COLOR_SELECTED = 0xd8d3c4;
const ANIMATION_DURATION = 350;

const statusColors = {
    past: { normal: 0xf1e2d9, bright: 0xe6cdbd },
    current: { normal: 0xdeebe1, bright: 0xb9d7c1 },
    upcoming: { normal: 0xf3e7ce, bright: 0xe9d3a0 }
};

// хранилище активных анимаций для возможности отмены
const activeAnimations = new Map();

// получение текущего цвета меша
function getMeshColor(mesh) {
    return Array.isArray(mesh.material) ? mesh.material[0].color.getHex() : mesh.material.color.getHex();
}

// мгновенная установка цвета
function setMeshColorInstant(mesh, hexColor) {
    if (!mesh.material) return;
    if (Array.isArray(mesh.material)) {
        mesh.material.forEach((mat) => mat.color.setHex(hexColor));
    } else {
        mesh.material.color.setHex(hexColor);
    }
    mesh.material.needsUpdate = true;
}

// плавная анимация изменения цвета
function animateMeshColor(mesh, targetHex, duration = ANIMATION_DURATION) {
    if (!mesh.material) return;
    if (activeAnimations.has(mesh)) {
        cancelAnimationFrame(activeAnimations.get(mesh));
        activeAnimations.delete(mesh);
    }
    const startColor = new THREE.Color(getMeshColor(mesh));
    const targetColor = new THREE.Color(targetHex);
    const startTime = performance.now();

    function step(now) {
        const t = Math.min((now - startTime) / duration, 1);
        setMeshColorInstant(mesh, startColor.clone().lerp(targetColor, t).getHex());
        if (t < 1) {
            activeAnimations.set(mesh, requestAnimationFrame(step));
        } else {
            activeAnimations.delete(mesh);
        }
    }
    activeAnimations.set(mesh, requestAnimationFrame(step));
}

// сброс всех кабинетов к белому цвету
function resetAllRoomsToWhite(instant = true) {
    roomMeshes.forEach((mesh) => {
        if (mesh.userData.showPanel) {
            if (instant) setMeshColorInstant(mesh, COLOR_WHITE);
            else animateMeshColor(mesh, COLOR_WHITE);
        }
    });
}

// получение цвета в зависимости от статуса пары
function getStatusColor(status, variant = 'normal') {
    if (status === 'past') return COLOR_WHITE;
    return statusColors[status]?.[variant] ?? COLOR_WHITE;
}

// сброс активной подсветки (выбранного или активного кабинета)
function resetActiveSelection() {
    if (activeHighlightedMesh) {
        const status = activeHighlightedMesh.userData.pairStatus;
        animateMeshColor(activeHighlightedMesh, status && status !== 'past' ? getStatusColor(status, 'normal') : COLOR_WHITE);
        activeHighlightedMesh = null;
    }
    if (selectedMesh) {
        animateMeshColor(selectedMesh, COLOR_WHITE);
        selectedMesh = null;
    }
}

// обработка клика по 3d-сцене
function handleClick(event) {
    const clientX = event.clientX ?? event.touches?.[0]?.clientX;
    const clientY = event.clientY ?? event.touches?.[0]?.clientY;
    if (clientX == null || clientY == null) return;

    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(roomMeshes, false);

    resetActiveSelection();

    if (intersects.length === 0) {
        hideRoomPanel();
        clickInfoDiv.textContent = 'Кликните по объекту';
        return;
    }

    const mesh = intersects[0].object;
    const userData = mesh.userData;

    if (highlightedMeshes.includes(mesh)) {
        const status = mesh.userData.pairStatus;
        if (status && status !== 'past') animateMeshColor(mesh, getStatusColor(status, 'bright'));
        activeHighlightedMesh = mesh;
        clickInfoDiv.textContent = `Клик: ${userData.roomName}`;
        showRoomPanel(userData.roomNumber, userData.roomName);
    } else if (userData.showPanel) {
        animateMeshColor(mesh, COLOR_SELECTED);
        selectedMesh = mesh;
        clickInfoDiv.textContent = `Клик: ${userData.roomName}`;
        showRoomPanel(userData.roomNumber || '', userData.roomName);
    } else {
        hideRoomPanel();
        clickInfoDiv.textContent = `Клик: ${userData.roomName || 'Объект'} (без информации)`;
    }
}

// регистрация событий pointer и touch для различения клика и перетаскивания
renderer.domElement.addEventListener('pointerdown', (event) => {
    isPointerDown = true;
    pointerDownPos.set(event.clientX, event.clientY);
});
renderer.domElement.addEventListener('pointerup', (event) => {
    if (!isPointerDown) return;
    isPointerDown = false;
    const dx = event.clientX - pointerDownPos.x;
    const dy = event.clientY - pointerDownPos.y;
    if (Math.hypot(dx, dy) < DRAG_THRESHOLD) handleClick(event);
});
renderer.domElement.addEventListener('touchstart', (event) => {
    if (event.touches.length === 1) {
        isPointerDown = true;
        pointerDownPos.set(event.touches[0].clientX, event.touches[0].clientY);
    } else {
        isPointerDown = false;
    }
});
renderer.domElement.addEventListener('touchend', (event) => {
    if (!isPointerDown) return;
    isPointerDown = false;
    const touch = event.changedTouches[0];
    if (Math.hypot(touch.clientX - pointerDownPos.x, touch.clientY - pointerDownPos.y) < DRAG_THRESHOLD) {
        handleClick(touch);
    }
});

// функции работы с панелью кабинета
function showRoomPanel(roomNumber, roomName) {
    roomPanelTitle.textContent = `${roomName}${roomNumber ? ` (${roomNumber})` : ''}`;
    roomPanelContent.innerHTML = '';

    const roomPairs = currentSchedule.filter((p) => p.roomId === roomNumber);
    if (roomPairs.length === 0) {
        roomPanelContent.innerHTML = '<p>Нет пар на выбранную дату</p>';
    } else {
        roomPairs.forEach((pair) => {
            const item = document.createElement('div');
            item.className = `room-pair-item ${getPairStatus(pair)}`;
            item.innerHTML = `
                <span class="room-pair-date">${pair.time}</span>
                <div class="room-pair-group">${pair.name}</div>
                <div class="room-pair-teacher">${pair.teacher || 'Преподаватель не указан'}</div>
            `;
            roomPanelContent.appendChild(item);
        });
    }
    roomPanel.classList.add('visible');
}

function hideRoomPanel() {
    roomPanel.classList.remove('visible');
    // карточку закрыли — кнопка «Назад» больше не нужна
    roomPanel.classList.remove('can-return');
    scheduleCollapsedForRoom = false;
}

// обработчики закрытия панели кабинета
roomPanelClose.addEventListener('click', () => {
    resetActiveSelection();
    hideRoomPanel();
});

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && roomPanel.classList.contains('visible')) {
        resetActiveSelection();
        hideRoomPanel();
    }
});

document.addEventListener('pointerdown', (event) => {
    if (!roomPanel.classList.contains('visible')) return;
    if (roomPanel.contains(event.target) || renderer.domElement.contains(event.target)) return;
    resetActiveSelection();
    hideRoomPanel();
});

// управление сайдбаром
function setSidebarOpen(open) {
    sidebar.classList.toggle('open', open);
    sidebar.setAttribute('aria-hidden', String(!open));
    sidebarToggle.setAttribute('aria-expanded', String(open));
}

sidebarToggle.addEventListener('click', () => setSidebarOpen(!sidebar.classList.contains('open')));

// Кнопки «Применить» больше нет: группу применяет открытие расписания,
// см. applySelectedGroupIfNeeded ниже.

// обработчики смены даты
dateInput.addEventListener('change', () => {
    if (!dateInput.value) {
        dateInput.value = currentDate;
        return;
    }
    currentDate = dateInput.value;
    refreshForDateChange();
});

prevDayBtn.addEventListener('click', () => {
    const date = new Date(currentDate);
    date.setDate(date.getDate() - 1);
    currentDate = getDateString(date);
    dateInput.value = currentDate;
    refreshForDateChange();
});

nextDayBtn.addEventListener('click', () => {
    const date = new Date(currentDate);
    date.setDate(date.getDate() + 1);
    currentDate = getDateString(date);
    dateInput.value = currentDate;
    refreshForDateChange();
});

// переключение этажей
function setFloor(floor) {
    currentFloor = floor;

    floorNumbers.forEach((span) => {
        const isActive = parseInt(span.dataset.floor, 10) === floor;
        span.classList.toggle('active', isActive);
        span.setAttribute('aria-current', isActive ? 'true' : 'false');
    });

    if (floor !== 2) {
        stubOverlay.classList.add('visible');
        currentSchedule = [];
        updatePairsUI([]);
        resetAllRoomsToWhite(true);
        hideRoomPanel();
        highlightedMeshes = [];
        selectedMesh = null;
        activeHighlightedMesh = null;
    } else {
        stubOverlay.classList.remove('visible');
        if (currentGroup) applyGroup(currentGroup);
    }
}

floorNumbers.forEach((span) => {
    span.addEventListener('click', () => setFloor(parseInt(span.dataset.floor, 10)));
    span.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setFloor(parseInt(span.dataset.floor, 10));
        }
    });
});

setFloor(currentFloor);

// переход на страницу недельного расписания
weekDetailsBtn.addEventListener('click', () => {
    const params = new URLSearchParams({ group: currentGroup || '', floor: currentFloor });
    window.location.href = `${WEEK_SCHEDULE_PAGE_URL}?${params.toString()}`;
});

// основной цикл анимации
function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

// обработка изменения размеров контейнера
const resizeObserver = new ResizeObserver(() => {
    renderer.setSize(container.clientWidth, container.clientHeight);
    controls?.handleResize();
});
resizeObserver.observe(container);

// свайп от левого края для открытия сайдбара на мобильных
const SWIPE_EDGE_THRESHOLD = 24;
const SWIPE_MIN_DISTANCE = 60;
let swipeStartX = null;
let swipeStartY = null;
let isSwipeGesture = false;

document.addEventListener('touchstart', (event) => {
    if (event.touches.length !== 1) return;

    const touch = event.touches[0];
    if (touch.clientX <= SWIPE_EDGE_THRESHOLD) {
        swipeStartX = touch.clientX;
        swipeStartY = touch.clientY;
        isSwipeGesture = true;
    } else {
        swipeStartX = null;
        swipeStartY = null;
        isSwipeGesture = false;
    }
}, { passive: true });

document.addEventListener('touchmove', (event) => {
    if (!isSwipeGesture || swipeStartX === null || swipeStartY === null) return;

    const touch = event.touches[0];
    const deltaX = touch.clientX - swipeStartX;
    const deltaY = touch.clientY - swipeStartY;

    if (deltaX > SWIPE_MIN_DISTANCE && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
        if (!sidebar.classList.contains('open')) {
            setSidebarOpen(true);
        }
        isSwipeGesture = false;
        swipeStartX = null;
        swipeStartY = null;
        event.preventDefault();
    }
}, { passive: false });

document.addEventListener('touchend', () => {
    isSwipeGesture = false;
    swipeStartX = null;
    swipeStartY = null;
});

// закрытие сайдбара кнопкой-крестиком (показывается на мобильных)
document.getElementById('sidebar-close').addEventListener('click', () => {
    setSidebarOpen(false);
});

// важнейшая функция // 
const stubVideo = document.querySelector('.stub-video');
if (stubVideo) {
    stubOverlay.addEventListener('click', () => {
        stubVideo.muted = !stubVideo.muted;
        if (stubVideo.paused) stubVideo.play();
    });
}

// ---------------------------------------------------------------------------
// ШТОРКА РАСПИСАНИЯ
//
// Открыта она или нет — хранит скрытый чекбокс #schedule-toggle в сайдбаре.
// Css смотрит на него сам (правило :has в styles.css), поэтому здесь мы
// только переключаем галочку, а показом занимаются стили.
//
// Открыть можно тремя способами: кнопкой в сайдбаре, свайпом снизу вверх
// и программно. Закрыть — кнопкой, свайпом вниз, кликом мимо панели
// или клавишей Escape.
// ---------------------------------------------------------------------------
const scheduleToggle = document.getElementById('schedule-toggle');
const schedulePanel = document.getElementById('schedule-panel');

// Полоса у нижнего края экрана, с которой начинается жест открытия (в пикселях).
const SHEET_EDGE_THRESHOLD = 32;
// Насколько далеко нужно провести пальцем, чтобы это посчиталось свайпом,
// а не случайным касанием.
const SHEET_MIN_DISTANCE = 60;

let sheetStartX = null;
let sheetStartY = null;
let sheetFromBottomEdge = false;

// Открывая расписание, сразу подтягиваем выбранную в списке группу.
// Благодаря этому на телефоне достаточно одного нажатия: выбрал группу —
// нажал «Показать расписание». Отдельное «Применить» больше не нужно,
// но продолжает работать как раньше.
function applySelectedGroupIfNeeded() {
    const selectedGroup = groupSelect.value;
    if (selectedGroup && selectedGroup !== currentGroup) {
        applyGroup(selectedGroup);
        // группа сменилась — карточка старого кабинета уже неактуальна
        hideRoomPanel();
    }
}

// На телефоне сайдбар выезжает поверх карты. Если оставить его открытым,
// нажатие на пару подсветит кабинет, но самого кабинета видно не будет —
// поэтому вместе с расписанием закрываем сайдбар. На широком экране он
// карту не перекрывает, там закрывать нечего.
function closeSidebarOnNarrowScreen() {
    if (window.matchMedia('(max-width: 768px)').matches) {
        setSidebarOpen(false);
    }
}

// Записываем высоту шторки в css-переменную --sheet-height.
// Она нужна карточке кабинета: та встаёт ровно над расписанием,
// а не поверх него. Когда шторка закрыта, высота равна нулю.
function updateSheetHeight() {
    const height = scheduleToggle.checked ? schedulePanel.getBoundingClientRect().height : 0;
    document.documentElement.style.setProperty('--sheet-height', `${Math.round(height)}px`);
}

// Единая точка открытия и закрытия шторки: и свайп, и кнопка,
// и клик мимо панели проходят через неё.
function setScheduleOpen(open) {
    if (scheduleToggle.checked === open) return;
    scheduleToggle.checked = open;
    if (open) {
        applySelectedGroupIfNeeded();
        closeSidebarOnNarrowScreen();
    }
    // карта перестаёт реагировать на жесты, пока шторка открыта:
    // за визуальную часть отвечает css, за three.js — controls
    controls.enabled = !open;
    updateSheetHeight();
}

document.addEventListener('touchstart', (event) => {
    if (event.touches.length !== 1) {
        sheetStartY = null;
        return;
    }
    const touch = event.touches[0];
    sheetStartX = touch.clientX;
    sheetStartY = touch.clientY;
    sheetFromBottomEdge = touch.clientY >= window.innerHeight - SHEET_EDGE_THRESHOLD;
}, { passive: true });

document.addEventListener('touchmove', (event) => {
    if (sheetStartY === null || event.touches.length !== 1) return;

    const touch = event.touches[0];
    // deltaY меньше нуля — палец идёт вверх, больше нуля — вниз
    const deltaY = touch.clientY - sheetStartY;
    const deltaX = touch.clientX - sheetStartX;

    // жест должен быть достаточно длинным и заметно вертикальным
    if (Math.abs(deltaY) < SHEET_MIN_DISTANCE || Math.abs(deltaY) < Math.abs(deltaX) * 1.5) return;

    if (deltaY < 0 && sheetFromBottomEdge && !scheduleToggle.checked) {
        setScheduleOpen(true);
        sheetStartY = null;
    } else if (deltaY > 0 && scheduleToggle.checked && schedulePanel.contains(event.target)) {
        // вниз закрываем только если список прокручен в самое начало,
        // иначе жест принадлежит прокрутке списка пар
        if (pairsContainer.scrollTop <= 0) {
            setScheduleOpen(false);
            sheetStartY = null;
        }
    }
}, { passive: true });

document.addEventListener('touchend', () => {
    sheetStartY = null;
    sheetFromBottomEdge = false;
});

// клик вне шторки закрывает её (кнопка в сайдбаре продолжает переключать сама)
document.addEventListener('pointerdown', (event) => {
    if (!scheduleToggle.checked) return;
    if (schedulePanel.contains(event.target)) return;
    if (event.target.closest('.sidebar-action')) return;
    setScheduleOpen(false);
});

// Кнопка «Показать расписание» — это label чекбокса, она меняет его сама,
// минуя setScheduleOpen. Поэтому повторяем здесь те же три действия.
scheduleToggle.addEventListener('change', () => {
    if (scheduleToggle.checked) {
        applySelectedGroupIfNeeded();
        closeSidebarOnNarrowScreen();
    }
    controls.enabled = !scheduleToggle.checked;
    updateSheetHeight();
});

// Высота шторки меняется, когда в неё приходит другое число пар,
// — следим и обновляем переменную.
new ResizeObserver(updateSheetHeight).observe(schedulePanel);

// escape закрывает шторку
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && scheduleToggle.checked) setScheduleOpen(false);
});

// ---------------------------------------------------------------------------
// ПЕРЕХОД «ПАРА → КАБИНЕТ → НАЗАД»
//
// На телефоне открытое расписание занимает пол-экрана, и карточка кабинета
// вместе с ним почти не оставляет места карте. Поэтому при нажатии на пару
// расписание сворачивается, а в карточке появляется кнопка «Назад»,
// возвращающая его обратно. На широком экране места хватает, там ничего
// не сворачивается и кнопка не показывается.
// ---------------------------------------------------------------------------

// Этот обработчик добавлен вторым: сначала срабатывает тот, что выше по файлу
// и открывает карточку кабинета, и только потом сворачивается расписание.
pairsContainer.addEventListener('click', (event) => {
    if (!event.target.closest('.pair-card')) return;
    if (!scheduleToggle.checked) return;
    if (!window.matchMedia('(max-width: 768px)').matches) return;

    scheduleCollapsedForRoom = true;
    roomPanel.classList.add('can-return');   // css покажет кнопку «Назад»
    setScheduleOpen(false);
});

// «Назад»: прячем карточку и возвращаем расписание на место
roomPanelBack.addEventListener('click', () => {
    const shouldReopen = scheduleCollapsedForRoom;
    hideRoomPanel();
    if (shouldReopen) setScheduleOpen(true);
});

// ---------------------------------------------------------------------------
// кнопка «Сбросить вид»: возвращает камеру в исходное положение,
// если пользователь увёл карту зумом или перетаскиванием
// ---------------------------------------------------------------------------
document.getElementById('reset-view').addEventListener('click', () => {
    if (loadedModel) fitCameraToModel(loadedModel);
});
