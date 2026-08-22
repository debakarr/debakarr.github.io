---
title: "[LeetCode] 78. Subsets"
date: "2019-08-08"
description: "Subsets Link to original Problem on LeetCode Given a set of distinct integers, nums, return all possible subsets (the power set). Note: The solution set must not contain duplicate subsets. Example: Input: nums = [1,2,3] Output: [ [3], [1], [2], [1,2,3], [1,3], [2,3], [1,2], [] ] Company: Amazon, Microsoft Solution (Using Iteration): Time Complexity: Space Complexity: class Solution(object): def subsets(self, nums): \"\"\" :type nums: List[int] :rtype: List[List[int]] \"\"\" # Let's take an example, say we have nums = [1, 2, 3] # Initially we have an empty subset in the result i."
categories: ["Algorithms", "Programming", "LeetCode"]
tags: ["Algorithms", "Subsets", "Combinations", "Backtracking", "Recursion", "Programming"]
draft: false
---

### Subsets

[Link to original Problem on LeetCode](https://leetcode.com/problems/subsets/)

Given a set of **distinct** integers, *nums*, return all possible subsets (the power set).

**Note:** The solution set must not contain duplicate subsets.

**Example:**

**Input:** nums = \[1,2,3\]

**Output:**

\[ \[3\], \[1\], \[2\], \[1,2,3\], \[1,3\], \[2,3\], \[1,2\], \[\] \]

**Company:** *Amazon*, *Microsoft*

**Solution (Using Iteration):**

**Time Complexity:** **Space Complexity:**

```python
class Solution(object):
    def subsets(self, nums):
        """
        :type nums: List[int]
        :rtype: List[List[int]]
        """
        # Let's take an example, say we have nums = [1, 2, 3]
        # Initially we have an empty subset in the result i.e. result = [[]]
        # Adding [1] to each element of result (i.e. [[]], one element)
        #   [] + [1] = [1]
        #   we have result = [[], [1]]
        #
        # Adding [2] to each element of result (i.e.[[], [1]], two element)
        #   [] + [2] = [2]
        #   [1] + [2] = [1, 2]
        #   we have result = [[], [1], [2], [1, 2]]
        #
        # Adding [] to each element of result (i.e.[[], [1], [2], [1, 2]], four element)
        #   [] + [3] = [3]
        #   [1] + [3] = [1, 3]
        #   [2] + [3] = [2, 3]
        #   [1, 2] + [3] = [1, 2, 3]
        #   we have result = [[], [1], [2], [1, 2], [3], [1, 3], [2, 3], [1, 2, 3]]
        
        result = [[]]
        
        for num in nums:
            temp = result[:]
            for res in temp:
                result.append(res + [num])
    
        return result
```

**Solution (Using Recursion):**

**Time Complexity:** **Space Complexity:**

```python
class Solution(object):
    def subsets(self, nums):
        """
        :type nums: List[int]
        :rtype: List[List[int]]
        """
        # Let's take the same example, say we have nums = [1, 2, 3]
        # Initially we have an empty subset in the result i.e. result = [[]]
        # Adding [3] to each element of result (i.e. [[]], one element)
        #   [3] + [] = [3]
        #   we have result = [[], [3]]
        #
        # Adding [2] to each element of result (i.e.[[], [3]], two element)
        #   [2] + [] = [2]
        #   [2] + [3] = [2, 3]
        #   we have result = [[], [3], [2], [2, 3]]
        #
        # Adding [1] to each element of result (i.e.[[], [3], [2], [2, 3], four element)
        #   [1] + [] = [1]
        #   [1] + [3] = [1, 3]
        #   [1] + [2] = [1, 2]
        #   [1] + [2, 3] = [1, 2, 3]
        #   we have result = [[], [3], [2], [2, 3], [1], [1, 3], [1, 2], [1, 2, 3]]
        # This is kinda iterative approch which can be implemented rescursively 
        
        result = []
        
        self.subsetsHelper(nums, [], 0, result)
        
        return result
    
    def subsetsHelper(self, nums, subset, i, result):
        if i == len(nums):
            result.append(subset)
            return
        self.subsetsHelper(nums, subset, i + 1, result)
        self.subsetsHelper(nums, subset + [nums[i]], i + 1, result)
```
