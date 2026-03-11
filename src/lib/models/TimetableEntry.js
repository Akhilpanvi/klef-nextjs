import mongoose from 'mongoose'

/**
 * TimetableEntry
 * ──────────────
 * One document = one row from BTT CSV.
 * Every field name is taken directly from the real CSV columns.
 *
 * CSV quirks handled here:
 *  • DEPT column actually contains the source filename — stored as source_file
 *  • Hours go up to 24 (not 12) — full range stored
 *  • F-Dept has inconsistent casing — normalised on ingest
 *  • associative_sectionno = A/B/C/D/MA — used for clash filtering
 *  • REG = batch year prefix: R22/R23/R24/R25
 */
const schema = new mongoose.Schema(
  {
    // ── SOURCE ─────────────────────────────────────────────────────────────
    source_file:  { type: String },          // original DEPT column value (filename)
    reg:          { type: String, index: true }, // R22, R23, R24, R25
    dataset:      { type: String, default: 'live', index: true }, // snapshotId or 'live'/'master' (legacy)

    // ── SLOT ───────────────────────────────────────────────────────────────
    umatdayid:    { type: Number, required: true, min: 1, max: 6, index: true },
    umat_hourno:  { type: Number, required: true, min: 1, max: 24, index: true },

    // ── COURSE ─────────────────────────────────────────────────────────────
    course_code:  { type: String, trim: true, index: true },
    course_name:  { type: String, trim: true },
    year:         { type: Number, index: true },   // 1/2/3/4
    cocssiid:     { type: Number },
    coursedeliverycomponent: { type: Number },     // 1=L 2=T 3=P 4=S
    offered_by_deptid:  { type: Number },
    offered_to_deptid:  { type: Number },

    // ── SECTION ────────────────────────────────────────────────────────────
    main_sectionno:        { type: String, trim: true },
    associative_sectionno: { type: String, trim: true }, // A/B/C/D/MA
    faculty_seq:           { type: Number },
    sec_count:             { type: Number },

    // ── FACULTY ────────────────────────────────────────────────────────────
    emp_id:       { type: String, trim: true, index: true },
    faculty_name: { type: String, trim: true },
    faculty_dept: { type: String, trim: true, index: true }, // F-Dept normalised
    faculty_cohort: { type: String, trim: true },            // F-Cohort

    // ── ROOM ───────────────────────────────────────────────────────────────
    room_no:          { type: String, trim: true, index: true }, // ROOM NO
    umat_classroomno: { type: Number },
    room_con:         { type: String, trim: true },  // ROOM CON
    r_type:           { type: String, trim: true },  // R-TYPE
    r_cap:            { type: String, trim: true },  // R-CAP
    r_diff:           { type: String, trim: true },  // R-DIFF

    // ── META ───────────────────────────────────────────────────────────────
    src_d:            { type: String, trim: true },
    umat_academic_year_id: { type: Number },
    umat_semester_id:      { type: Number },
    fctt:             { type: String, trim: true },
    rctt:             { type: String, trim: true },
  },
  { timestamps: true }
)

// ── COMPOUND INDEXES for the most common query patterns ───────────────────

// Clash detection: room slot lookup
schema.index({ dataset: 1, umatdayid: 1, umat_hourno: 1, room_no: 1 })

// Clash detection: faculty slot lookup
schema.index({ dataset: 1, umatdayid: 1, umat_hourno: 1, emp_id: 1 })

// Faculty timetable fetch
schema.index({ dataset: 1, emp_id: 1, umatdayid: 1, umat_hourno: 1 })

// Room timetable fetch
schema.index({ dataset: 1, room_no: 1, umatdayid: 1, umat_hourno: 1 })

// Course timetable fetch
schema.index({ dataset: 1, course_code: 1, year: 1 })

// Free-faculty / free-room: day+hour lookup
schema.index({ dataset: 1, umatdayid: 1, umat_hourno: 1 })

// Faculty list autocomplete
schema.index({ dataset: 1, faculty_dept: 1, emp_id: 1 })

export default mongoose.models.TimetableEntry ||
  mongoose.model('TimetableEntry', schema)
