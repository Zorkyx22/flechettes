import { api, ApiError, type Class, type ManagedUser, type PublicUser } from "../net/api";
import { S } from "../strings";
import { el, noAssist } from "./dom";
import { promptDialog, toast } from "./toast";

/** Admin screen (manage teachers) or teacher screen (manage students + classes), by role. */
export function createManageScreen(opts: { user: PublicUser; goBack: () => void }): HTMLElement {
  const title = opts.user.role === "admin" ? S.manageTeachersTitle : S.manageStudentsTitle;
  const body = el("div", { class: "manage-body" });
  const screen = el(
    "div",
    { class: "screen manage" },
    el("header", { class: "bar" }, el("button", { class: "btn quiet", text: S.back, onclick: opts.goBack }), el("h1", { text: title })),
    body,
  );
  if (opts.user.role === "admin") renderTeachers(body);
  else renderStudents(body);
  return screen;
}

function failToast(err: unknown): void {
  toast(err instanceof ApiError && err.status === 409 ? S.usernameTaken : S.actionFailed);
}

/** Username + password create form; calls `create`, then clears and refreshes on success. */
function createForm(buttonText: string, create: (username: string, password: string) => Promise<unknown>, after: () => void): HTMLElement {
  const user = el("input", { type: "text" });
  const pass = el("input", { type: "password" });
  noAssist(user);
  noAssist(pass);
  const form = el(
    "form",
    { class: "create-form" },
    el("label", { text: S.loginUser }),
    user,
    el("label", { text: S.loginPassword }),
    pass,
    el("button", { class: "btn primary", type: "submit", text: buttonText }),
  );
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const username = user.value.trim();
    if (username === "") return toast(S.usernameNeeded);
    if (pass.value.length < 4) return toast(S.passwordTooShort);
    try {
      await create(username, pass.value);
      user.value = "";
      pass.value = "";
      toast(S.accountCreated);
      after();
    } catch (err) {
      failToast(err);
    }
  });
  return form;
}

/** A row of account controls shared by teachers (admin) and students (teacher). */
function accountRow(
  u: ManagedUser,
  actions: {
    setDisabled: (id: string, disabled: boolean) => Promise<unknown>;
    setPassword: (id: string, password: string) => Promise<unknown>;
    refresh: () => void;
    classSelect?: Node;
  },
): HTMLElement {
  const controls = el(
    "div",
    { class: "row-actions" },
    actions.classSelect ?? null,
    el("button", {
      class: "btn quiet",
      text: u.disabled ? S.enableAccount : S.disableAccount,
      onclick: async () => {
        try {
          await actions.setDisabled(u.id, !u.disabled);
          actions.refresh();
        } catch (err) {
          failToast(err);
        }
      },
    }),
    el("button", {
      class: "btn quiet",
      text: S.resetPassword,
      onclick: async () => {
        const pw = await promptDialog({ title: S.promptNewPassword(u.username), label: S.loginPassword, type: "password", ok: S.okButton, cancel: S.cancelButton });
        if (pw === null) return;
        if (pw.length < 4) return toast(S.passwordTooShort);
        try {
          await actions.setPassword(u.id, pw);
          toast(S.passwordChanged);
        } catch (err) {
          failToast(err);
        }
      },
    }),
  );
  return el(
    "li",
    { class: "card" },
    el(
      "div",
      { class: "row-who" },
      el("strong", { text: u.username }),
      u.disabled ? el("small", { class: "badge-off", text: S.disabledBadge }) : null,
    ),
    controls,
  );
}

function renderTeachers(body: HTMLElement): void {
  const list = el("ul", { class: "cards" });
  const refresh = async (): Promise<void> => {
    const teachers = await api.adminTeachers().catch(() => [] as ManagedUser[]);
    list.replaceChildren(
      ...(teachers.length === 0
        ? [el("li", { class: "empty", text: S.noTeachers })]
        : teachers.map((t) =>
            accountRow(t, { setDisabled: api.adminSetTeacherDisabled, setPassword: api.adminSetTeacherPassword, refresh: () => void refresh() }),
          )),
    );
  };
  body.append(createForm(S.addTeacher, api.adminCreateTeacher, () => void refresh()), list);
  void refresh();
}

function renderStudents(body: HTMLElement): void {
  let classes: Class[] = [];
  const classList = el("ul", { class: "cards" });
  const studentList = el("ul", { class: "cards" });

  function classOptions(selected: string | null): HTMLSelectElement {
    const select = el("select", { class: "class-select" }) as HTMLSelectElement;
    select.append(el("option", { value: "", text: S.noClass }));
    for (const c of classes) select.append(el("option", { value: c.id, text: c.name }));
    select.value = selected ?? "";
    return select;
  }
  const classNameOf = (id: string | null | undefined): string => classes.find((c) => c.id === id)?.name ?? S.noClass;

  const refreshClasses = async (): Promise<void> => {
    classes = await api.teacherClasses().catch(() => [] as Class[]);
    classList.replaceChildren(
      ...(classes.length === 0
        ? [el("li", { class: "empty", text: S.noClasses })]
        : classes.map((c) => el("li", { class: "card" }, el("strong", { text: c.name })))),
    );
  };

  const refreshStudents = async (): Promise<void> => {
    const students = await api.teacherStudents().catch(() => [] as ManagedUser[]);
    studentList.replaceChildren(
      ...(students.length === 0
        ? [el("li", { class: "empty", text: S.noStudents })]
        : students.map((st) => {
            const select = classOptions(st.classId ?? null);
            select.addEventListener("change", async () => {
              try {
                await api.teacherSetStudentClass(st.id, select.value === "" ? null : select.value);
              } catch (err) {
                failToast(err);
                select.value = st.classId ?? "";
              }
            });
            select.title = classNameOf(st.classId);
            return accountRow(st, {
              setDisabled: api.teacherSetStudentDisabled,
              setPassword: api.teacherSetStudentPassword,
              refresh: () => void refreshStudents(),
              classSelect: select,
            });
          })),
    );
  };

  // Add-class form.
  const className = el("input", { type: "text" });
  noAssist(className);
  const classForm = el(
    "form",
    { class: "create-form" },
    el("label", { text: S.className }),
    className,
    el("button", { class: "btn primary", type: "submit", text: S.addClass }),
  );
  classForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = className.value.trim();
    if (name === "") return;
    try {
      await api.teacherCreateClass(name);
      className.value = "";
      toast(S.classCreated);
      await refreshClasses();
      await refreshStudents(); // refresh selects with the new class
    } catch (err) {
      failToast(err);
    }
  });

  // Add-student form (with a class picker).
  const studentUser = el("input", { type: "text" });
  const studentPass = el("input", { type: "password" });
  noAssist(studentUser);
  noAssist(studentPass);
  const studentClass = classOptions(null);
  const studentForm = el(
    "form",
    { class: "create-form" },
    el("label", { text: S.loginUser }),
    studentUser,
    el("label", { text: S.loginPassword }),
    studentPass,
    el("label", { text: S.classLabel }),
    studentClass,
    el("button", { class: "btn primary", type: "submit", text: S.addStudent }),
  );
  studentForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const username = studentUser.value.trim();
    if (username === "") return toast(S.usernameNeeded);
    if (studentPass.value.length < 4) return toast(S.passwordTooShort);
    try {
      await api.teacherCreateStudent(username, studentPass.value, studentClass.value === "" ? null : studentClass.value);
      studentUser.value = "";
      studentPass.value = "";
      toast(S.accountCreated);
      await refreshStudents();
    } catch (err) {
      failToast(err);
    }
  });

  body.append(
    el("section", { class: "manage-section" }, el("h2", { text: S.classesTitle }), classForm, classList),
    el("section", { class: "manage-section" }, el("h2", { text: S.manageStudentsTitle }), studentForm, studentList),
  );
  void (async () => {
    await refreshClasses();
    // Rebuild the add-student picker now classes are loaded.
    studentClass.replaceChildren(el("option", { value: "", text: S.noClass }), ...classes.map((c) => el("option", { value: c.id, text: c.name })));
    await refreshStudents();
  })();
}
