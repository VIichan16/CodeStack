import React, { useState, useEffect, useLayoutEffect } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";
const api = async (path, method = "GET", data) => {
    let r = await fetch("/api" + path, {
        method,
        headers:
            data instanceof FormData
                ? {}
                : { "Content-Type": "application/json" },
        body:
            data instanceof FormData
                ? data
                : data === undefined
                  ? undefined
                  : JSON.stringify(data),
    });
    if (!r.ok) {
        const err = await r.json().catch(() => null);
        throw Error(err?.error || "요청 실패 (" + r.status + ")");
    }
    return r.json();
};
const run = (fn) => async (e) => {
    e?.preventDefault?.();
    try {
        await fn(e);
    } catch (err) {
        alert(err.message);
    }
};
const fields = (e) => Object.fromEntries(new FormData(e.target));
const go = (p) => {
    location.hash = p;
    window.scrollTo(0, 0);
};
function LessonView({ lesson, me, submit }) {
    const [course, setCourse] = useState(null);
    const [tab, setTab] = useState("curriculum");
    useEffect(() => {
        let active = true;
        setCourse(null);
        api("/courses/" + lesson.course).then(c => { if (active) setCourse(c); }).catch(() => {});
        return () => { active = false; };
    }, [lesson.course]);
    const lessons = course?.lessons || [];
    const index = lessons.findIndex(l => String(l.id) === String(lesson.id));
    const prev = index > 0 ? lessons[index - 1] : null;
    const next = index >= 0 ? lessons[index + 1] : null;
    return <main className="learning">
        <div className="learning-top"><a href={"#course/" + lesson.course}>← 강좌로 돌아가기</a><span>CODE STACK / CLASSROOM</span></div>
        <div className="learning-grid">
            <div className="learning-main">
                <div className="learning-heading"><small>{course?.title || "온라인 강의"} · {lesson.week}주차</small><h1>{lesson.title}</h1></div>
                {lesson.kind === "video" ? <div className="learning-player">
                                <video
                                    key={lesson.id}
                                    controls
                                    playsInline
                                    src={"/media/" + lesson.file}
                                    onLoadedMetadata={(e) =>
                                        (e.target.currentTime = lesson.seconds)
                                    }
                                    onTimeUpdate={(e) => {
                                        let v = e.target;
                                        if (
                                            Math.floor(v.currentTime) % 5 ===
                                                0 &&
                                            v.dataset.saved !==
                                                String(
                                                    Math.floor(v.currentTime),
                                                )
                                        ) {
                                            v.dataset.saved = String(
                                                Math.floor(v.currentTime),
                                            );
                                            api(
                                                "/lessons/" +
                                                    lesson.id +
                                                    "/progress",
                                                "POST",
                                                { seconds: v.currentTime },
                                            ).catch(() => {});
                                        }
                                    }}
                                    onPause={(e) =>
                                        api(
                                            "/lessons/" +
                                                lesson.id +
                                                "/progress",
                                            "POST",
                                            { seconds: e.target.currentTime },
                                        ).catch(() => {})
                                    }
                                />
                </div> : <div className="learning-file"><span>▤</span><h3>강의 자료</h3><a className="pill" download href={"/media/" + lesson.file}>자료 다운로드 ↓</a></div>}
                <div className="learning-navigation">
                    {prev ? <a href={"#lesson/" + prev.id}>← 이전 강의</a> : <span>← 이전 강의</span>}
                    <small>{index >= 0 ? `${index + 1} / ${lessons.length}` : "학습 중"}</small>
                    {next ? <a className="learning-next" href={"#lesson/" + next.id}>다음 강의 →</a> : <span>다음 강의 →</span>}
                </div>
                <section className="learning-material"><h3>강의 안내</h3><p>강의를 시청하고 필요한 학습 자료를 확인하세요.</p>
                            {lesson.kind === "video" && lesson.attachment && (
                                <div className="line">
                                    <h3>강의 자료</h3>
                                    <a
                                        className="pill"
                                        download={
                                            lesson.attachment_name || "강의자료"
                                        }
                                        href={"/media/" + lesson.attachment}
                                    >
                                        {lesson.attachment_name || "강의 자료"}{" "}
                                        다운로드 ↓
                                    </a>
                                </div>
                            )}
                </section>
            </div>
            <aside className="learning-sidebar">
                <div className="learning-side-title"><small>YOUR CLASSROOM</small><h2>학습 공간</h2></div>
                <div className="learning-tabs"><button className={tab === "curriculum" ? "active" : ""} onClick={() => setTab("curriculum")}>커리큘럼</button><button className={tab === "qa" ? "active" : ""} onClick={() => setTab("qa")}>Q&A ({lesson.questions.length})</button></div>
                <div className="learning-side-body">
                {tab === "curriculum" ? <>
                    <p className="learning-count">전체 강의 {lessons.length}개</p>
                    {!course && <p>강의 목록을 불러오는 중이거나 조회할 수 없습니다.</p>}
                    {[...new Set(lessons.map(l => l.week))].map(w => <section key={w} className="learning-week"><h3>{w}주차</h3>{lessons.filter(l => l.week === w).map(l => <a key={l.id} href={"#lesson/" + l.id} className={String(l.id) === String(lesson.id) ? "current" : ""} aria-current={String(l.id) === String(lesson.id) ? "page" : undefined}><span className="learning-icon">{l.kind === "video" ? "▷" : "▤"}</span><span>{l.title}<small>{String(l.id) === String(lesson.id) ? "현재 학습 중" : l.kind === "video" ? "동영상 강의" : "학습 자료"}</small></span></a>)}</section>)}
                </> : <section className="learning-qa"><h3>강의 질문</h3>{!lesson.questions.length && <p>아직 등록된 질문이 없습니다.</p>}
                            {lesson.questions.map((q) => (
                                <div className="line" key={q.id}>
                                    <b>{q.name}</b>
                                    <p>{q.body}</p>
                                    {q.answer && <p>관리자: {q.answer}</p>}
                                    {me?.role === "admin" && (
                                        <form
                                            onSubmit={submit(
                                                "/questions/" +
                                                    q.id +
                                                    "/answer",
                                            )}
                                        >
                                            <input
                                                name="answer"
                                                required
                                                placeholder="답변"
                                            />
                                            <button>답변 저장</button>
                                        </form>
                                    )}
                                </div>
                            ))}
                            {me?.role === "student" && (
                                <form
                                    onSubmit={submit(
                                        "/lessons/" + lesson.id + "/questions",
                                    )}
                                >
                                    <textarea
                                        name="body"
                                        required
                                        placeholder="질문을 남겨주세요"
                                    />
                                    <button>질문 등록</button>
                                </form>
                            )}
                </section>}
                </div>
            </aside>
        </div>
    </main>;
}
function Admin({ courses, refresh }) {
    const [data, setData] = useState(null),
        [tab, setTab] = useState("courses"),
        [edit, setEdit] = useState(null),
        [search, setSearch] = useState("");
    const reload = async () => {
        await refresh();
        setData(await api("/admin/overview"));
    };
    useEffect(() => {
        reload().catch((e) => alert(e.message));
    }, []);
    const save = (url, method = "POST", multi = false) =>
        run(async (e) => {
            await api(url, method, multi ? new FormData(e.target) : fields(e));
            setEdit(null);
            e.target.reset();
            await reload();
        });
    const del = (url, msg) =>
        run(async () => {
            if (confirm(msg)) {
                await api(url, "DELETE");
                await reload();
            }
        });
    return (
        <main className="panel">
            <small>CODE STACK / STUDIO</small>
            <h2>
                관리자 대시보드<span>.</span>
            </h2>
            <div className="adminStats">
                {[
                    ["강좌", courses.length],
                    ["회원", data?.users.length],
                    ["수강 신청", data?.enrollments.length],
                    [
                        "미답변 질문",
                        data?.questions.filter((x) => !x.answer).length,
                    ],
                ].map(([k, v]) => (
                    <div key={k}>
                        {k}
                        <strong>{v ?? "–"}</strong>
                    </div>
                ))}
            </div>
            <div className="tabs">
                {[
                    ["courses", "강의 관리"],
                    ["users", "회원 관리"],
                    ["questions", "Q&A"],
                    ["reviews", "수강평"],
                    ["popup", "팝업"],
                ].map(([k, v]) => (
                    <button
                        key={k}
                        className={tab === k ? "dark" : ""}
                        onClick={() => {
                            setTab(k);
                            setEdit(null);
                        }}
                    >
                        {v}
                    </button>
                ))}
            </div>
            {tab === "courses" ? (
                <>
                    <form
                        key={edit?.id || "new"}
                        onSubmit={save(
                            edit ? "/courses/" + edit.id : "/courses",
                            edit ? "PUT" : "POST",
                        )}
                    >
                        <h3>{edit ? "강좌 수정" : "강좌 등록"}</h3>
                        {["title", "teacher", "category", "description"].map(
                            (k, i) => (
                                <input
                                    key={k}
                                    name={k}
                                    defaultValue={edit?.[k] || ""}
                                    placeholder={
                                        [
                                            "강좌 제목",
                                            "강의자",
                                            "카테고리",
                                            "설명",
                                        ][i]
                                    }
                                    required
                                />
                            ),
                        )}
                        <button className="dark">저장</button>
                        {edit && (
                            <button type="button" onClick={() => setEdit(null)}>
                                취소
                            </button>
                        )}
                    </form>
                    <input
                        placeholder="강좌 검색"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                    {courses
                        .filter((c) =>
                            (c.title + " " + c.teacher)
                                .toLowerCase()
                                .includes(search.toLowerCase()),
                        )
                        .map((c) => (
                            <div className="adminRow" key={c.id}>
                                <div>
                                    <b>{c.title}</b>
                                    <p>
                                        {c.teacher} · 수강생 {c.students}명
                                    </p>
                                </div>
                                <a className="pill" href={"#course/" + c.id}>
                                    콘텐츠 관리
                                </a>
                                <button onClick={() => setEdit(c)}>수정</button>
                                <button
                                    className="danger"
                                    onClick={del(
                                        "/courses/" + c.id,
                                        "강좌와 모든 수강 기록, 질문, 리뷰를 영구 삭제할까요?",
                                    )}
                                >
                                    삭제
                                </button>
                            </div>
                        ))}
                </>
            ) : tab === "users" ? (
                data?.users.map((u) => (
                    <div className="line" key={u.id}>
                        <b>{u.name}</b> · {u.email} · {u.role}
                        <p>
                            {data.enrollments
                                .filter((x) => x.uid === u.id)
                                .map((x) => x.title)
                                .join(", ") || "수강 내역 없음"}
                        </p>
                    </div>
                ))
            ) : tab === "questions" ? (
                data?.questions.map((q) => (
                    <form
                        key={q.id}
                        onSubmit={save("/questions/" + q.id + "/answer")}
                    >
                        <b>
                            {q.title} · {q.name}
                        </b>
                        <p>{q.body}</p>
                        <input
                            name="answer"
                            defaultValue={q.answer || ""}
                            required
                        />
                        <button>답변 저장</button>
                    </form>
                ))
            ) : tab === "reviews" ? (
                data?.reviews.map((r) => (
                    <div className="adminRow" key={r.cid + ":" + r.uid}>
                        <div>
                            {r.title} · {r.name} · ★ {r.score}
                            <p>{r.body}</p>
                        </div>
                        <button
                            className="danger"
                            onClick={del(
                                "/reviews/" + r.cid + "/" + r.uid,
                                "수강평을 삭제할까요?",
                            )}
                        >
                            삭제
                        </button>
                    </div>
                ))
            ) : (
                <form onSubmit={save("/popup", "POST", true)}>
                    <h3>팝업 관리</h3>
                    <input type="file" name="file" accept="image/*" required />
                    <button>등록 / 교체</button>
                    <button
                        type="button"
                        onClick={del("/popup", "팝업을 삭제할까요?")}
                    >
                        삭제
                    </button>
                </form>
            )}
        </main>
    );
}
function Register() {
    const [pw, P] = useState(""),
        [confirm, C] = useState(""),
        [phone, T] = useState(""),
        [busy, B] = useState(false),
        [show, H] = useState(false);
    const valid =
        pw.length >= 8 &&
        /[a-z]/i.test(pw) &&
        /\d/.test(pw) &&
        /[^a-z0-9]/i.test(pw);
    const act = (fn) =>
        run(async (e) => {
            B(true);
            try {
                await fn(e);
            } finally {
                B(false);
            }
        });
    return (
        <main className="panel narrow">
            <h2>Join Code Stack.</h2>
            <form
                onSubmit={act(async (e) => {
                    await api("/register", "POST", {
                        ...fields(e),
                        phone,
                        password: pw,
                        passwordConfirm: confirm,
                    });
                    alert("회원가입 완료");
                    go("login");
                })}
            >
                <label>이름</label>
                <input name="name" required />
                <label>이메일</label>
                <input name="email" type="email" required />
                <label>비밀번호</label>
                <input
                    type={show ? "text" : "password"}
                    value={pw}
                    onChange={(e) => P(e.target.value)}
                    required
                    maxLength={128}
                />
                <small>영문, 숫자, 특수문자 포함 8자 이상</small>
                <label>비밀번호 확인</label>
                <input
                    type={show ? "text" : "password"}
                    value={confirm}
                    onChange={(e) => C(e.target.value)}
                    required
                />
                <small>
                    {confirm
                        ? pw === confirm
                            ? "비밀번호가 일치합니다"
                            : "비밀번호가 일치하지 않습니다"
                        : ""}
                </small>
                <label>
                    <input
                        type="checkbox"
                        checked={show}
                        onChange={(e) => H(e.target.checked)}
                    />{" "}
                    비밀번호 표시
                </label>
                <label>휴대전화 번호</label>
                <input
                    type="tel"
                    value={phone}
                    onChange={(e) => T(e.target.value)}
                    placeholder="01012345678"
                    required
                    pattern="010-?[0-9]{4}-?[0-9]{4}"
                />
                <small>전화번호는 인증 없이 등록됩니다.</small>
                <button
                    className="dark"
                    disabled={
                        busy ||
                        !valid ||
                        pw !== confirm ||
                        !/^010-?\d{4}-?\d{4}$/.test(phone)
                    }
                >
                    회원가입
                </button>
            </form>
            <a href="#login">로그인</a>
        </main>
    );
}
function LessonUpload({ onSubmit }) {
    const [kind, K] = useState("video");
    return (
        <form onSubmit={onSubmit}>
            <h3>주차별 콘텐츠 등록</h3>
            <label>주차</label>
            <input
                name="week"
                type="number"
                min="1"
                defaultValue="1"
                required
            />
            <label>강의 제목</label>
            <input name="title" required />
            <select
                name="kind"
                value={kind}
                onChange={(e) => K(e.target.value)}
            >
                <option value="video">동영상 + 선택 자료</option>
                <option value="file">자료만 등록</option>
            </select>
            <label>{kind === "video" ? "강의 동영상" : "강의 자료"}</label>
            <input
                key={kind}
                type="file"
                name="file"
                accept={
                    kind === "video"
                        ? ".mp4,.webm"
                        : ".zip,.pdf,.pptx,.docx,.xlsx"
                }
                required
            />
            {kind === "video" && (
                <>
                    <label>첨부 강의 자료 (선택)</label>
                    <input
                        type="file"
                        name="attachment"
                        accept=".zip,.pdf,.pptx,.docx,.xlsx"
                    />
                </>
            )}
            <button className="dark">콘텐츠 등록</button>
        </form>
    );
}
function App() {
    const [page, P] = useState(location.hash.slice(1) || "home"),
        [me, M] = useState(null),
        [courses, C] = useState([]),
        [detail, D] = useState(null),
        [lesson, L] = useState(null),
        [popup, U] = useState(null),
        [search, S] = useState(""),
        [sort, T] = useState("new"),
        [idx, I] = useState(0),
        [motion, B] = useState(0),
        [tab, V] = useState("curriculum");
    const refresh = () => api("/courses").then(C);
    const load = () => {
        if (page.startsWith("course/"))
            api("/courses/" + page.split("/")[1])
                .then(D)
                .catch((e) => alert(e.message));
        if (page.startsWith("lesson/"))
            api("/lessons/" + page.split("/")[1])
                .then(L)
                .catch((e) => alert(e.message));
        if (page === "mine")
            api("/mine")
                .then(C)
                .catch(() => go("login"));
        else refresh();
    };
    useEffect(() => {
        api("/me").then(M);
        api("/popup").then(U);
        const h = () => P(location.hash.slice(1) || "home");
        window.addEventListener("hashchange", h);
        return () => window.removeEventListener("hashchange", h);
    }, []);
    useEffect(() => {
        D(null);
        L(null);
        V("curriculum");
        load();
    }, [page]);
    useLayoutEffect(() => {
        if (page !== "home") return;
        const el = document.querySelector(".journey"),
            stage = el.querySelector(".stage"),
            header = document.querySelector("header");
        const h = () => {
            const top = header.getBoundingClientRect().height;
            el.style.setProperty("--header-height", top + "px");
            const distance = Math.max(1, el.offsetHeight - stage.offsetHeight);
            B(
                Math.max(
                    0,
                    Math.min(
                        1,
                        (top - el.getBoundingClientRect().top) / distance,
                    ),
                ),
            );
        };
        const ro = new ResizeObserver(h);
        ro.observe(header);
        window.addEventListener("scroll", h, { passive: true });
        window.addEventListener("resize", h);
        h();
        return () => {
            ro.disconnect();
            window.removeEventListener("scroll", h);
            window.removeEventListener("resize", h);
        };
    }, [page]);
    let filtered = courses
        .filter((c) =>
            (c.title + " " + c.teacher)
                .toLowerCase()
                .includes(search.toLowerCase()),
        )
        .sort((a, b) =>
            sort === "rating"
                ? Number(b.rating) - Number(a.rating)
                : b.id - a.id,
        );
    let step = Math.min(3, Math.floor(motion * 4));
    const slogans = [
        "BUILD BEYOND LIMITS.",
        "KNOWLEDGE IS POWER.",
        "STACK YOUR POTENTIAL.",
        "CREATE YOUR FUTURE.",
    ];
    const korean = [
        "한계를 넘어, 가능성을 설계하다.",
        "지식은 새로운 세계를 여는 힘이다.",
        "한 줄의 코드부터 무한한 가능성까지.",
        "당신의 미래를 직접 만들어가세요.",
    ];
    const submit = (path, method = "POST", multipart = false) =>
        run(async (e) => {
            await api(
                path,
                method,
                multipart ? new FormData(e.target) : fields(e),
            );
            e.target.reset();
            load();
            api("/popup").then(U);
        });
    const catalog = (
        <section className="catalog" id="catalog">
            <small>THE LEARNING COLLECTION / 01</small>
            <h2>
                Explore courses<span>.</span>
            </h2>
            <p>당신의 다음 가능성을 발견하세요.</p>
            <div className="filters">
                <input
                    placeholder="강의 제목 또는 강의자 검색"
                    value={search}
                    onChange={(e) => {
                        S(e.target.value);
                        I(0);
                    }}
                />
                <select
                    value={sort}
                    onChange={(e) => {
                        T(e.target.value);
                        I(0);
                    }}
                >
                    <option value="new">최신순</option>
                    <option value="rating">평점순</option>
                </select>
            </div>
            <div className="courses">
                {filtered.slice(idx * 8, idx * 8 + 8).map((c, i) => (
                    <button
                        className="course"
                        key={c.id}
                        onClick={() => go("course/" + c.id)}
                    >
                        <div className={"cover tone" + (i % 4)}>
                            <small>CODE STACK / {c.category}</small>
                            <strong>{["{ }", "</>", "01", "λ"][i % 4]}</strong>
                            <small>LEARN. BUILD. REPEAT.</small>
                        </div>
                        <h3>{c.title}</h3>
                        <p>
                            {c.teacher} · ★ {Number(c.rating || 0).toFixed(1)}
                        </p>
                    </button>
                ))}
            </div>
            <div className="pagination">
                {Array.from(
                    { length: Math.ceil(filtered.length / 8) },
                    (_, i) => (
                        <button
                            className={idx === i ? "dark" : ""}
                            onClick={() => I(i)}
                            key={i}
                        >
                            {i + 1}
                        </button>
                    ),
                )}
            </div>
        </section>
    );
    return (
        <>
            <header>
                <a className="logo" href="#home">
                    CODE<span>STACK.</span>
                </a>
                <nav>
                    <a href="#courses">강의 탐색</a>
                    {me && <a href="#mine">내 강의</a>}
                    {me?.role === "admin" && <a href="#admin">관리자</a>}
                </nav>
                {me ? (
                    <button
                        onClick={run(async () => {
                            await api("/logout", "POST");
                            M(null);
                            go("home");
                        })}
                    >
                        로그아웃
                    </button>
                ) : (
                    <a className="pill" href="#login">
                        로그인 ↗
                    </a>
                )}
            </header>
            {page === "home" ? (
                <>
                    <section className="journey">
                        <div className="stage">
                            <div className="eyebrow">
                                INDEPENDENT LEARNING PLATFORM{" "}
                                <span>EST. 2026</span>
                            </div>
                            <div className="heroWord">CODE STACK.</div>
                            <img
                                className="goddess"
                                src="/goddess.png"
                                alt="황금 가면의 날개 여신"
                            />
                            <div className="slogan" aria-live="polite">
                                <div className="sloganContent" key={step}>
                                    <small>
                                        THE ART OF LEARNING — 0{step + 1}
                                    </small>
                                    <h1>{slogans[step]}</h1>
                                    <p>{korean[step]}</p>
                                </div>
                            </div>
                            <div className="stagefoot">
                                <span>SCROLL TO EXPLORE ↓</span>
                                <a href="#courses">강의 둘러보기 ↗</a>
                            </div>
                        </div>
                    </section>
                    {catalog}
                </>
            ) : page === "courses" || page === "mine" ? (
                catalog
            ) : page === "register" ? (
                <Register />
            ) : page === "login" ? (
                <main className="panel narrow">
                    <h2>
                        {page === "login"
                            ? "Welcome back."
                            : "Join Code Stack."}
                    </h2>
                    <form
                        onSubmit={run(async (e) => {
                            let u = await api("/" + page, "POST", fields(e));
                            if (page === "login") {
                                M(u);
                                go("courses");
                            } else go("login");
                        })}
                    >
                        {page === "register" && (
                            <input name="name" placeholder="이름" required />
                        )}
                        <input
                            name="email"
                            type="email"
                            placeholder="이메일"
                            required
                        />
                        <input
                            name="password"
                            type="password"
                            placeholder="비밀번호"
                            required
                            minLength={8}
                        />
                        <button className="dark">
                            {page === "login" ? "로그인" : "회원가입"}
                        </button>
                    </form>
                    <a href={page === "login" ? "#register" : "#login"}>
                        {page === "login" ? "회원가입" : "로그인"}
                    </a>
                </main>
            ) : page === "admin" && me?.role === "admin" ? (
                <Admin courses={courses} refresh={refresh} />
            ) : detail && page.startsWith("course/") ? (
                <main className="panel">
                    <small>{detail.category}</small>
                    <h2>{detail.title}</h2>
                    <p>{detail.description}</p>
                    <p>
                        {detail.teacher} · 수강생 {detail.students}명 · ★{" "}
                        {detail.reviews.length
                            ? (
                                  detail.reviews.reduce(
                                      (a, b) => a + b.score,
                                      0,
                                  ) / detail.reviews.length
                              ).toFixed(1)
                            : "0.0"}
                    </p>
                    <button
                        className="dark"
                        onClick={run(async () => {
                            if (!me) return go("login");
                            await api(
                                "/courses/" + detail.id + "/enroll",
                                "POST",
                            );
                            alert("수강 신청 완료");
                            load();
                        })}
                    >
                        수강 신청
                    </button>
                    <div className="tabs">
                        <button onClick={() => V("curriculum")}>
                            대시보드 / 커리큘럼
                        </button>
                        <button onClick={() => V("reviews")}>수강평</button>
                    </div>
                    {tab === "curriculum" ? (
                        <>
                            {[
                                ...new Set(detail.lessons.map((l) => l.week)),
                            ].map((w) => (
                                <section key={w}>
                                    <h3>{w}주차</h3>
                                    {detail.lessons
                                        .filter((l) => l.week === w)
                                        .map((l) => (
                                            <div className="line" key={l.id}>
                                                <a
                                                    href={
                                                        me
                                                            ? "#lesson/" + l.id
                                                            : "#login"
                                                    }
                                                >
                                                    {l.kind === "video"
                                                        ? "▷"
                                                        : "▤"}{" "}
                                                    {l.title}
                                                </a>
                                                {me?.role === "admin" && (
                                                    <>
                                                        <form
                                                            onSubmit={submit(
                                                                "/lessons/" +
                                                                    l.id,
                                                                "PUT",
                                                            )}
                                                        >
                                                            <input
                                                                name="title"
                                                                defaultValue={
                                                                    l.title
                                                                }
                                                                required
                                                            />
                                                            <input
                                                                name="week"
                                                                type="number"
                                                                min="1"
                                                                defaultValue={
                                                                    l.week
                                                                }
                                                                required
                                                            />
                                                            <button>
                                                                정보 수정
                                                            </button>
                                                        </form>
                                                        <button
                                                            className="danger"
                                                            onClick={run(
                                                                async () => {
                                                                    if (
                                                                        confirm(
                                                                            "콘텐츠와 시청 기록 및 질문을 삭제할까요?",
                                                                        )
                                                                    ) {
                                                                        await api(
                                                                            "/lessons/" +
                                                                                l.id,
                                                                            "DELETE",
                                                                        );
                                                                        load();
                                                                    }
                                                                },
                                                            )}
                                                        >
                                                            콘텐츠 삭제
                                                        </button>
                                                        <form
                                                            onSubmit={submit(
                                                                "/lessons/" +
                                                                    l.id +
                                                                    "/file",
                                                                "PUT",
                                                                true,
                                                            )}
                                                        >
                                                            <input
                                                                type="file"
                                                                name="file"
                                                                required
                                                            />
                                                            <button>
                                                                파일 교체
                                                            </button>
                                                        </form>
                                                        {l.kind === "video" && (
                                                            <>
                                                                <p>
                                                                    {l.attachment
                                                                        ? "첨부 자료: " +
                                                                          l.attachment_name
                                                                        : "첨부 자료 없음"}
                                                                </p>
                                                                <form
                                                                    onSubmit={submit(
                                                                        "/lessons/" +
                                                                            l.id +
                                                                            "/attachment",
                                                                        "PUT",
                                                                        true,
                                                                    )}
                                                                >
                                                                    <input
                                                                        type="file"
                                                                        name="attachment"
                                                                        accept=".zip,.pdf,.pptx,.docx,.xlsx"
                                                                        required
                                                                    />
                                                                    <button>
                                                                        자료
                                                                        등록 /
                                                                        교체
                                                                    </button>
                                                                </form>
                                                                {l.attachment && (
                                                                    <button
                                                                        className="danger"
                                                                        onClick={run(
                                                                            async () => {
                                                                                if (
                                                                                    confirm(
                                                                                        "첨부 자료만 삭제할까요?",
                                                                                    )
                                                                                ) {
                                                                                    await api(
                                                                                        "/lessons/" +
                                                                                            l.id +
                                                                                            "/attachment",
                                                                                        "DELETE",
                                                                                    );
                                                                                    load();
                                                                                }
                                                                            },
                                                                        )}
                                                                    >
                                                                        첨부
                                                                        자료
                                                                        삭제
                                                                    </button>
                                                                )}
                                                            </>
                                                        )}
                                                    </>
                                                )}
                                            </div>
                                        ))}
                                </section>
                            ))}
                            {me?.role === "admin" && (
                                <LessonUpload
                                    onSubmit={submit(
                                        "/courses/" + detail.id + "/lessons",
                                        "POST",
                                        true,
                                    )}
                                />
                            )}
                        </>
                    ) : (
                        <>
                            {detail.reviews.map((r) => (
                                <div className="line" key={r.uid}>
                                    {r.name} · ★ {r.score} / {r.body}
                                </div>
                            ))}
                            {me && (
                                <form
                                    onSubmit={submit(
                                        "/courses/" + detail.id + "/review",
                                    )}
                                >
                                    <select
                                        name="score"
                                        defaultValue={
                                            detail.reviews.find(
                                                (r) => r.uid === me.id,
                                            )?.score || 5
                                        }
                                    >
                                        {[1, 2, 3, 4, 5].map((n) => (
                                            <option key={n}>{n}</option>
                                        ))}
                                    </select>
                                    <textarea
                                        name="body"
                                        defaultValue={
                                            detail.reviews.find(
                                                (r) => r.uid === me.id,
                                            )?.body || ""
                                        }
                                        required
                                    />
                                    <button>수강평 저장 / 수정</button>
                                </form>
                            )}
                        </>
                    )}
                </main>
            ) : lesson && page.startsWith("lesson/") ? (
                <LessonView lesson={lesson} me={me} submit={submit} />
            ) : (
                <main className="panel">
                    불러오는 중 또는 접근 권한이 없습니다.
                </main>
            )}
            {popup && page === "home" && (
                <div className="popup">
                    <button onClick={() => U(null)}>닫기 ×</button>
                    <img src={"/media/" + popup.file} />
                </div>
            )}
            <footer>
                CODE STACK. © 2026 <span>BUILD BEYOND LIMITS.</span>
            </footer>
        </>
    );
}
createRoot(document.getElementById("root")).render(<App />);
