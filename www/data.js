/* ---------------- Data model ----------------
   Lifted verbatim from the original workout-tracker.html, with small additions:
   - schemeFor(): per-exercise scheme override (deadlift is 1x5, not 3x5)
   - modeOf():   how a group's working set is measured (weight vs reps)
   These stay DOM-free so they can be imported by any module. */

export const GROUPS = {
  push:  { name:"Upper Push", short:"Push", primary:"Bench Press",
    secondary:[
      {label:"Dips", note:"Lean forward for more chest · stay upright for more triceps"},
      {label:"Pushup"},
      {label:"Incline Bench"}
    ]},
  pull:  { name:"Upper Pull", short:"Pull", primary:"Pullup",
    secondary:[ {label:"Row"} ]},
  press: { name:"Overhead Press", short:"Press", primary:"Overhead Press",
    secondary:[
      {label:"Kettlebell Press"},
      {label:"Seated Dumbbell Press", note:"Variant: squat and press"},
      {label:"Handstand Press"}
    ]},
  squat: { name:"Squat", short:"Squat", primary:"Back Squat",
    secondary:[
      {label:"Goblet Squat"},
      {label:"Zercher Squat"},
      {label:"Front Squat"},
      {label:"Bulgarian Split Squat"}
    ]},
  hinge: { name:"Hinge", short:"Hinge", primary:"Deadlift",
    secondary:[ {label:"Romanian Deadlift"} ]},
  core:  { name:"Core", short:"Core", primary:"Hanging Leg Raise",
    secondary:[ {label:"Hanging Leg Raise"} ]}  // only movement listed; used for both roles
};

/* Which groups are PRIMARY on each week/day. Everything else that day is SECONDARY.
   Pull auto-assigned: primary on the Press/Hinge/Core-heavy day, secondary otherwise. */
export const SCHEDULE = {
  A:{
    Tue:["push","squat","pull"],
    Thu:["press","hinge","core"],
    Sun:["push","squat","pull"]
  },
  B:{
    Tue:["press","squat","pull"],
    Thu:["push","hinge","core"],
    Sun:["press","squat","pull"]
  }
};

export const ORDER = ["push","pull","press","squat","hinge","core"];

/* Base schemes by role. Primary = heavy/low-rep, Secondary = higher-rep. */
export const SCHEME = { P:{sets:3,reps:5}, S:{sets:3,reps:10} };

/* Per-exercise scheme override. Deadlift (hinge primary) is a single heavy set. */
export function schemeFor(groupKey, role){
  if(groupKey==="hinge" && role==="P") return {sets:1,reps:5};
  return SCHEME[role];
}

/* How a group's working set is measured, given its role.
   Bodyweight movements are tracked by reps; everything else by weight.
   Note pull is split: the Pullup PRIMARY is reps, but the Row SECONDARY is weighted. */
export function modeOf(groupKey, role){
  if(groupKey==="core") return "reps";              // Hanging Leg Raise in both roles
  if(groupKey==="pull" && role==="P") return "reps"; // Pullup; Row (secondary) is weighted
  return "weight";
}

/* Groups that get a progress plot (core excluded per spec). */
export const PLOT_GROUPS = ["push","pull","press","squat","hinge"];

export function fullDay(d){ return {Tue:"Tuesday",Thu:"Thursday",Sun:"Sunday"}[d]; }
