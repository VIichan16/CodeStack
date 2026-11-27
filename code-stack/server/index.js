import express from "express";
import session from "express-session";
import mysql from "mysql2/promise";
import multer from "multer";
import connect from "express-mysql-session";
import { randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import path from "node:path";
import { unlink } from "node:fs/promises";
const config = {
    host: "db",
    user: "stack",
    password: "stack_local",
    database: "codestack",
};
const db = mysql.createPool({ ...config, multipleStatements: true });
const q = async (s, p = []) => {
    const args = [];
    s = s.replace(/\$(\d+)/g, (_, i) => {
        args.push(p[Number(i) - 1]);
        return "?";
    });
    const [rows] = await db.query(s, args);
    return rows;
};
await q(
    `CREATE TABLE IF NOT EXISTS users(id int auto_increment primary key,email varchar(255) unique,name text,password text,role text);CREATE TABLE IF NOT EXISTS courses(id int auto_increment primary key,title text,teacher text,description text,category text,created timestamp default current_timestamp);CREATE TABLE IF NOT EXISTS lessons(id int auto_increment primary key,course int,week int,title text,kind text,file text,foreign key(course) references courses(id));CREATE TABLE IF NOT EXISTS enrollments(uid int,cid int,primary key(uid,cid));CREATE TABLE IF NOT EXISTS reviews(uid int,cid int,score int check(score between 1 and 5),body text,primary key(uid,cid));CREATE TABLE IF NOT EXISTS progress(uid int,lid int,seconds double,primary key(uid,lid));CREATE TABLE IF NOT EXISTS questions(id int auto_increment primary key,uid int,lid int,body text,answer text);CREATE TABLE IF NOT EXISTS popup(id int primary key,file text);`,
);
if (!(await q("SHOW COLUMNS FROM users LIKE 'phone'")).length)
    await q("ALTER TABLE users ADD COLUMN phone varchar(20) UNIQUE");
if (!(await q("SHOW COLUMNS FROM lessons LIKE 'attachment'")).length)
    await q(
        "ALTER TABLE lessons ADD COLUMN attachment varchar(255) NULL, ADD COLUMN attachment_name varchar(255) NULL",
    );
const hash = (p, s = randomUUID()) =>
    s + ":" + scryptSync(p, s, 64).toString("hex");
for (const [e, n, p, r] of [
    ["admin@codestack.local", "관리자", "Admin123!", "admin"],
    ["student@codestack.local", "수강자", "Student123!", "student"],
])
    await q(
        "insert into users(email,name,password,role) values($1,$2,$3,$4) on duplicate key update id=id",
        [e, n, hash(p), r],
    );
await q("CREATE TABLE IF NOT EXISTS app_flags(name varchar(100) primary key)");
if (
    !(await q("select name from app_flags where name='seeded'")).length &&
    !(await q("select id from courses limit 1")).length
)
    for (const [t, c] of [
        ["JavaScript, 처음부터 제대로", "Frontend"],
        ["React 인터페이스 설계", "Frontend"],
        ["Node.js 서버 개발", "Backend"],
        ["Python 프로그래밍", "Language"],
        ["SQL 데이터베이스", "Database"],
        ["Docker 실전 입문", "DevOps"],
        ["알고리즘의 기초", "CS"],
        ["웹 디자인 시스템", "Design"],
    ])
        await q(
            "insert into courses(title,teacher,description,category) values($1,$2,$3,$4)",
            [t, "Code Stack", "기초부터 실전까지 단계별로 학습합니다.", c],
        );
await q("insert ignore into app_flags values('seeded')");
const app = express();
app.use(express.json());
app.use(
    session({
        store: new (connect(session))(config),
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        cookie: { httpOnly: true, sameSite: "lax" },
    }),
);
const upload = multer({
    storage: multer.diskStorage({
        destination: "/media",
        filename: (r, f, cb) =>
            cb(null, randomUUID() + path.extname(f.originalname).toLowerCase()),
    }),
    limits: { fileSize: 1024 * 1024 * 1024 },
});
const auth = (r, s, n) => (r.session.user ? n() : s.sendStatus(401));
const admin = (r, s, n) =>
    r.session.user?.role === "admin" ? n() : s.sendStatus(403);
const route = (method, url, ...handlers) =>
    app[method](
        "/api" + url,
        ...handlers.map(
            (h) => (r, s, n) => Promise.resolve(h(r, s, n)).catch(n),
        ),
    );
route("get", "/me", (r, s) => s.json(r.session.user || null));
route("post", "/login", async (r, s) => {
    const [u] = await q("select * from users where email=$1", [r.body.email]);
    if (
        !u ||
        hash(String(r.body.password), u.password.split(":")[0]) !== u.password
    )
        return s.status(401).json({ error: "로그인 정보를 확인하세요" });
    r.session.user = { id: u.id, name: u.name, role: u.role };
    s.json(r.session.user);
});
route("post", "/logout", (r, s) => r.session.destroy(() => s.json(true)));
const phoneOf = (v) => String(v || "").replace(/[- ]/g, "");
route("post", "/register", async (r, s) => {
    const { email, name, password, passwordConfirm } = r.body,
        phone = phoneOf(r.body.phone);
    if (
        typeof email !== "string" ||
        !email.includes("@") ||
        typeof name !== "string" ||
        !name.trim() ||
        typeof password !== "string" ||
        password.length < 8 ||
        password.length > 128 ||
        !/[a-z]/i.test(password) ||
        !/\d/.test(password) ||
        !/[^a-z0-9]/i.test(password) ||
        password !== passwordConfirm
    )
        return s
            .status(400)
            .json({ error: "회원 정보 및 비밀번호 조건을 확인하세요" });
    if (!/^010\d{8}$/.test(phone))
        return s.status(400).json({ error: "전화번호를 확인하세요" });
    try {
        await q(
            "insert into users(email,name,password,role,phone) values($1,$2,$3,'student',$4)",
            [email.trim(), name.trim(), hash(password), phone],
        );
        s.json(true);
    } catch (e) {
        if (e.code === "ER_DUP_ENTRY")
            return s
                .status(409)
                .json({ error: "이미 등록된 이메일 또는 전화번호입니다" });
        throw e;
    }
});
route("get", "/courses", async (r, s) =>
    s.json(
        await q(
            `select c.*,coalesce((select avg(score) from reviews where cid=c.id),0) rating,(select count(*) from enrollments where cid=c.id) students from courses c order by id desc`,
        ),
    ),
);
route("get", "/courses/:id", async (r, s) => {
    const id = r.params.id;
    const [course] = await q("select * from courses where id=$1", [id]);
    if (!course) return s.sendStatus(404);
    s.json({
        ...course,
        lessons: await q(
            "select * from lessons where course=$1 order by week,id",
            [id],
        ),
        reviews: await q(
            "select reviews.*,users.name from reviews join users on uid=users.id where cid=$1",
            [id],
        ),
        students: (
            await q("select count(*) n from enrollments where cid=$1", [id])
        )[0].n,
    });
});
route("post", "/courses", admin, async (r, s) => {
    const { title, teacher, description, category } = r.body;
    s.json({
        id: (
            await q(
                "insert into courses(title,teacher,description,category) values($1,$2,$3,$4)",
                [title, teacher, description, category],
            )
        ).insertId,
    });
});
route("post", "/courses/:id/enroll", auth, async (r, s) => {
    await q(
        "insert into enrollments values($1,$2) on duplicate key update uid=uid",
        [r.session.user.id, r.params.id],
    );
    s.json(true);
});
route("get", "/mine", auth, async (r, s) =>
    s.json(
        await q(
            "select courses.* from courses join enrollments on cid=courses.id where uid=$1",
            [r.session.user.id],
        ),
    ),
);
route("post", "/courses/:id/review", auth, async (r, s) => {
    await q(
        "insert into reviews values($1,$2,$3,$4) on duplicate key update score=values(score),body=values(body)",
        [r.session.user.id, r.params.id, r.body.score, r.body.body],
    );
    s.json(true);
});
const discard = async (f) => {
    if (f) await unlink(f.path).catch(() => {});
};
const materialOK = (f) =>
    f &&
    [".zip", ".pdf", ".pptx", ".docx", ".xlsx"].includes(
        path.extname(f.originalname).toLowerCase(),
    );
route(
    "post",
    "/courses/:id/lessons",
    admin,
    upload.fields([
        { name: "file", maxCount: 1 },
        { name: "attachment", maxCount: 1 },
    ]),
    async (r, s) => {
        const f = r.files?.file?.[0],
            a = r.files?.attachment?.[0],
            { kind, title, week } = r.body;
        try {
            if (
                !f ||
                !title?.trim() ||
                !Number.isInteger(Number(week)) ||
                Number(week) < 1 ||
                !["video", "file"].includes(kind) ||
                (kind === "video" &&
                    ![".mp4", ".webm"].includes(
                        path.extname(f.originalname).toLowerCase(),
                    )) ||
                (kind === "file" && !materialOK(f)) ||
                (a && (kind !== "video" || !materialOK(a)))
            ) {
                await discard(f);
                await discard(a);
                return s
                    .status(400)
                    .json({ error: "파일 형식과 강의 정보를 확인하세요" });
            }
            await q(
                "insert into lessons(course,week,title,kind,file,attachment,attachment_name) values($1,$2,$3,$4,$5,$6,$7)",
                [
                    r.params.id,
                    week,
                    title,
                    kind,
                    f.filename,
                    a?.filename || null,
                    a
                        ? Buffer.from(a.originalname, "latin1")
                              .toString("utf8")
                              .slice(0, 255)
                        : null,
                ],
            );
            s.json(true);
        } catch (e) {
            await discard(f);
            await discard(a);
            throw e;
        }
    },
);
route(
    "put",
    "/lessons/:id/attachment",
    admin,
    upload.single("attachment"),
    async (r, s) => {
        const f = r.file;
        try {
            if (!materialOK(f)) {
                await discard(f);
                return s.sendStatus(400);
            }
            const result = await q(
                "update lessons set attachment=$1,attachment_name=$2 where id=$3 and kind='video'",
                [
                    f.filename,
                    Buffer.from(f.originalname, "latin1")
                        .toString("utf8")
                        .slice(0, 255),
                    r.params.id,
                ],
            );
            if (!result.affectedRows) {
                await discard(f);
                return s.sendStatus(404);
            }
            s.json(true);
        } catch (e) {
            await discard(f);
            throw e;
        }
    },
);
route("delete", "/lessons/:id/attachment", admin, async (r, s) => {
    await q(
        "update lessons set attachment=null,attachment_name=null where id=$1",
        [r.params.id],
    );
    s.json(true);
});
route(
    "put",
    "/lessons/:id/file",
    admin,
    upload.single("file"),
    async (r, s) => {
        if (!r.file) return s.sendStatus(400);
        await q("update lessons set file=$1 where id=$2", [
            r.file.filename,
            r.params.id,
        ]);
        s.json(true);
    },
);
route("get", "/lessons/:id", auth, async (r, s) => {
    const [l] = await q("select * from lessons where id=$1", [r.params.id]);
    if (!l) return s.sendStatus(404);
    s.json({
        ...l,
        seconds:
            (
                await q(
                    "select seconds from progress where uid=$1 and lid=$2",
                    [r.session.user.id, l.id],
                )
            )[0]?.seconds || 0,
        questions: await q(
            "select questions.*,users.name from questions join users on uid=users.id where lid=$1 order by id",
            [l.id],
        ),
    });
});
route("post", "/lessons/:id/progress", auth, async (r, s) => {
    await q(
        "insert into progress values($1,$2,$3) on duplicate key update seconds=values(seconds)",
        [
            r.session.user.id,
            r.params.id,
            Math.max(0, Number(r.body.seconds) || 0),
        ],
    );
    s.json(true);
});
route("post", "/lessons/:id/questions", auth, async (r, s) => {
    await q("insert into questions(uid,lid,body) values($1,$2,$3)", [
        r.session.user.id,
        r.params.id,
        r.body.body,
    ]);
    s.json(true);
});
route("post", "/questions/:id/answer", admin, async (r, s) => {
    await q("update questions set answer=$1 where id=$2", [
        r.body.answer,
        r.params.id,
    ]);
    s.json(true);
});
route("get", "/popup", async (r, s) =>
    s.json((await q("select * from popup where id=1"))[0] || null),
);
route("post", "/popup", admin, upload.single("file"), async (r, s) => {
    if (!r.file) return s.sendStatus(400);
    await q(
        "insert into popup values(1,$1) on duplicate key update file=values(file)",
        [r.file.filename],
    );
    s.json(true);
});
route("delete", "/popup", admin, async (r, s) => {
    await q("delete from popup");
    s.json(true);
});
// Admin management: existing data is preserved on startup.
route("get", "/admin/overview", admin, async (r, s) =>
    s.json({
        users: await q("select id,name,email,role from users order by id desc"),
        questions: await q(
            "select questions.*,users.name,lessons.title from questions join users on users.id=uid join lessons on lessons.id=lid order by questions.id desc",
        ),
        reviews: await q(
            "select reviews.*,users.name,courses.title from reviews join users on users.id=uid join courses on courses.id=cid",
        ),
        enrollments: await q(
            "select enrollments.*,courses.title from enrollments join courses on courses.id=cid",
        ),
    }),
);
route("put", "/courses/:id", admin, async (r, s) => {
    const { title, teacher, description, category } = r.body;
    if (
        ![title, teacher, description, category].every(
            (x) => typeof x === "string" && x.trim(),
        )
    )
        return s.sendStatus(400);
    await q(
        "update courses set title=$1,teacher=$2,description=$3,category=$4 where id=$5",
        [title, teacher, description, category, r.params.id],
    );
    s.json(true);
});
const remove = async (id, course) => {
    const c = await db.getConnection();
    try {
        await c.beginTransaction();
        const [rows] = await c.query(
            course
                ? "select id from courses where id=? for update"
                : "select id from lessons where id=? for update",
            [id],
        );
        if (!rows.length) throw Error("not found");
        if (course) {
            await c.query(
                "delete progress from progress join lessons on lid=lessons.id where course=?",
                [id],
            );
            await c.query(
                "delete questions from questions join lessons on lid=lessons.id where course=?",
                [id],
            );
            await c.query("delete from lessons where course=?", [id]);
            await c.query("delete from reviews where cid=?", [id]);
            await c.query("delete from enrollments where cid=?", [id]);
            await c.query("delete from courses where id=?", [id]);
        } else {
            await c.query("delete from progress where lid=?", [id]);
            await c.query("delete from questions where lid=?", [id]);
            await c.query("delete from lessons where id=?", [id]);
        }
        await c.commit();
    } catch (e) {
        await c.rollback();
        throw e;
    } finally {
        c.release();
    }
};
route("delete", "/courses/:id", admin, async (r, s) => {
    await remove(r.params.id, true);
    s.json(true);
});
route("delete", "/lessons/:id", admin, async (r, s) => {
    await remove(r.params.id, false);
    s.json(true);
});
route("put", "/lessons/:id", admin, async (r, s) => {
    const { title, week } = r.body;
    if (!title?.trim() || !Number.isInteger(Number(week)) || Number(week) < 1)
        return s.sendStatus(400);
    await q("update lessons set title=$1,week=$2 where id=$3", [
        title,
        week,
        r.params.id,
    ]);
    s.json(true);
});
route("delete", "/reviews/:cid/:uid", admin, async (r, s) => {
    await q("delete from reviews where cid=$1 and uid=$2", [
        r.params.cid,
        r.params.uid,
    ]);
    s.json(true);
});
app.use((e, r, s, n) => {
    console.error(e);
    s.status(400).json({ error: "요청을 처리하지 못했습니다." });
});
app.listen(4000, "0.0.0.0");
