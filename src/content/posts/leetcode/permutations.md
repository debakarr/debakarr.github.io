---
title: "[LeetCode] 46. Permutations"
date: "2019-07-23"
description: "Permutations Link to original Problem on LeetCode Given a collection of distinct integers, return all possible permutations. Example: Input: [1,2,3] Output: [ [1,2,3], [1,3,2], [2,1,3], [2,3,1], [3,1,2], [3,2,1] ] Company: Microsoft, Adobe, Google Solution (Backtracking and Recursion): Time Complexity: Space Complexity: class Solution(object): def permute(self, nums): \"\"\" :type nums: List[int] :rtype: List[List[int]] \"\"\" result = [] self.permuteHelper(nums, [], result) return result def permuteHelper(self, nums, path, result): if not nums: result.append(path) for i in range(len(nums)): self."
categories: ["Programming", "Algorithms", "LeetCode"]
tags: ["Permutations", "Backtracking", "Array", "LeetCode", "Algorithm"]
draft: false
---

### Permutations

[Link to original Problem on LeetCode](https://leetcode.com/problems/permutations/)

Given a collection of distinct integers, return all possible permutations.

**Example:**

Input: \[1,2,3\] Output: \[ \[1,2,3\], \[1,3,2\], \[2,1,3\], \[2,3,1\], \[3,1,2\], \[3,2,1\] \]

**Company:** *Microsoft*, *Adobe*, *Google*

**Solution (Backtracking and Recursion):**

**Time Complexity:** **Space Complexity:**

```python
class Solution(object):
    def permute(self, nums):
        """
        :type nums: List[int]
        :rtype: List[List[int]]
        """
        result = []
        
        self.permuteHelper(nums, [], result)
        
        return result
    
    def permuteHelper(self, nums, path, result):
        if not nums:
            result.append(path)
            
        for i in range(len(nums)):
            self.permuteHelper(nums[:i] + nums[i + 1:], path + [nums[i]], result)
```

**Explanation:**

Following is how the recursion is working:

```
permuteHelper(nums = [1, 2, 3] , path = [] , result = [] )
|____ permuteHelper(nums = [2, 3] , path = [1] , result = [] )
|      |___permuteHelper(nums = [3] , path = [1, 2] , result = [] )
|      |    |___permuteHelper(nums = [] , path = [1, 2, 3] , result = [[1, 2, 3]] ) # added a new permutation to the result
|      |___permuteHelper(nums = [2] , path = [1, 3] , result = [[1, 2, 3]] )
|           |___permuteHelper(nums = [] , path = [1, 3, 2] , result = [[1, 2, 3], [1, 3, 2]] ) # added a new permutation to the result
|____ permuteHelper(nums = [1, 3] , path = [2] , result = [[1, 2, 3], [1, 3, 2]] )
|      |___permuteHelper(nums = [3] , path = [2, 1] , result = [[1, 2, 3], [1, 3, 2]] )
|      |    |___permuteHelper(nums = [] , path = [2, 1, 3] , result = [[1, 2, 3], [1, 3, 2], [2, 1, 3]] ) # added a new permutation to the result
|      |___permuteHelper(nums = [1] , path = [2, 3] , result = [[1, 2, 3], [1, 3, 2], [2, 1, 3]] )
|           |___permuteHelper(nums = [] , path = [2, 3, 1] , result = [[1, 2, 3], [1, 3, 2], [2, 1, 3], [2, 3, 1]] ) # added a new permutation to the result
|____ permuteHelper(nums = [1, 2] , path = [3] , result = [[1, 2, 3], [1, 3, 2], [2, 1, 3], [2, 3, 1]] )
       |___permuteHelper(nums = [2] , path = [3, 1] , result = [[1, 2, 3], [1, 3, 2], [2, 1, 3], [2, 3, 1]] )
       |    |___permuteHelper(nums = [] , path = [3, 1, 2] , result = [[1, 2, 3], [1, 3, 2], [2, 1, 3], [2, 3, 1], [3, 1, 2]] ) # added a new permutation to the result
       |___permuteHelper(nums = [1] , path = [3, 2] , result = [[1, 2, 3], [1, 3, 2], [2, 1, 3], [2, 3, 1], [3, 1, 2]] )
            |___permuteHelper(nums = [] , path = [3, 2, 1] , result = [[1, 2, 3], [1, 3, 2], [2, 1, 3], [2, 3, 1], [3, 1, 2], [3, 2, 1]] ) # added a new permutation to the result
```
