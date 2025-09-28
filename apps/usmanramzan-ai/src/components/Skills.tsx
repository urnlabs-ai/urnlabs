import * as React from "react"
import { Progress } from "@/components/ui/progress"

const skills = [
  {
    name: "Kubernetes",
    level: 95,
  },
  {
    name: "DevOps",
    level: 90,
  },
  {
    name: "AWS",
    level: 85,
  },
  {
    name: "Terraform",
    level: 80,
  },
  {
    name: "Python",
    level: 75,
  },
]

export function Skills() {
  return (
    <div className="w-full max-w-4xl mx-auto">
      {skills.map((skill, index) => (
        <div key={index} className="mb-4">
          <div className="flex justify-between mb-1">
            <span className="text-base font-medium text-blue-700 dark:text-white">{skill.name}</span>
            <span className="text-sm font-medium text-blue-700 dark:text-white">{skill.level}%</span>
          </div>
          <Progress value={skill.level} />
        </div>
      ))}
    </div>
  )
}